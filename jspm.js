'use strict';

const Plugin = require('atokspark-jsplugin');
const child_process = require('child_process');
const exec = child_process.exec;
const fs = require('fs');
const juice = require('juice');
const path = require('path');

var jspmCSS = `
    body {
        background-color: black;
        color: white;
        font-family: monospace;
    }
    h2 {
        border-bottom: 1px solid #99ccff;
    }
    h4 {
        background-color: #003366;
        border-radius: 0.5em;
        padding: 1em;
    }
    th {
        background-color: #336699;
        padding: 0.5em 1em;
    }
    td {
        background-color: #003366;
        padding: 0.5em 1em;
    }`;

// FIXME: 現状は 1 node.js プラグイン毎に 1 node.js プロセスを立ち上げるのでスケールしません。
// 将来的には node.js プラグインフレームワークを変更して、単一 node.js プロセスで駆動する予定です。
class PluginHost {
    constructor(name) {
        this.name = name;
        var pkgJson = JSON.parse(fs.readFileSync(`${__dirname}/node_modules/${this.name}/package.json`, 'utf8'));
        this.jsName = `${__dirname}/node_modules/${this.name}/${pkgJson.main}`;
    }
    start(ready) {
        this.child = child_process.fork(this.jsName, [], {
            silent: true,
        });
        this.onText = (text) => {
            // TODO: HELLO の確認に失敗した時の処理
            if (text.indexOf('HELLO ') === 0) {
                ready(this);
            }
        };
        this.child.stdout.on('data', (data) => {
            var text = '' + data;
            var lines = text.split('\n');
            lines.pop();
            this.onText(lines.join('\n'));
        });
    }
    stop() {
        this.child.kill();
    }
    check(text, callback) {
        // CHECK を発行
        this.child.stdin.write(`CHECK ${text}\n`);
        this.onText = (text) => {
            // console.log(`checked: ${this.name}`);
            // console.log(data);
            // 単純に返せば良いはず
            callback(this, text);
        };
    }
    gettext(token, callback) {
        // GETTEXT を発行
        this.child.stdin.write(`GETTEXT ${token}\n`);
        this.onText = (text) => {
            // 単純に返せば良いはず
            callback(this, text);
        };
    }
}

const nonPluginModules = ['atokspark-jsplugin', 'juice'];
class PluginManager {
    constructor() {
        this.runnings = [];
    }
    ensurePluginsStarted(ready) {
        if (this.runnings && this.runnings.length > 0) {
            // 起動済み
            ready();
            return;
        }
        this.npm('list --json', (error, stdout, stderr) => {
            var deps = JSON.parse(stdout).dependencies;
            for (var name of Object.keys(deps)) {
                if (nonPluginModules.indexOf(name) >= 0) {
                    // TODO: プラグインでないモジュールだった場合の処理はもう少し手厚くやる必要あり
                    continue;
                }
                var plugin = new PluginHost(name);
                this.runnings.push(plugin);
                // console.log(`${plugin.name} created.`);
                // console.log(this.runnings);
            }
            if (this.runnings.length < 1) {
                // 1つもないが、制御は渡す。
                ready();
                return;
            }
            var acked = [];
            for (var plugin of this.runnings) {
                // console.log(plugin);
                plugin.start((thePlugin) => {
                    // console.log(`${thePlugin.name} started.`);
                    acked.push(thePlugin);
                    if (acked.length === this.runnings.length) {
                        ready();
                    }
                });
            }
        });
    }
    stopAllPlugins() {
        for (var plugin of this.runnings) {
            plugin.stop();
        }
        this.runnings = [];
    }
    restartPlugins(ready) {
        this.stopAllPlugins();
        this.ensurePluginsStarted(ready);
    }
    isRunning(name) {
        for (var item of this.runnings) {
            if (item.name === name) {
                return true;
            }
        }
        return false;
    }
    list(message, callback) {
        if (!message) {
            message = '';
        }
        this.npm('list --json', (error, stdout, stderr) => {
            var list = this.renderJSON(stdout, 'プラグイン一覧');
            callback(this.wrap(`${message}
                                ${list}`));
        });
    }
    renderJSON(s, title) {
        const deps = JSON.parse(s).dependencies;
        var items = [];
        for (var key of Object.keys(deps)) {
            if (nonPluginModules.indexOf(key) >= 0) {
                continue;
            }
            items.push(`<tr><td>${key}</td><td>${deps[key].version}</td></tr>`);
        }
        return `<h2>${title}</h2>
                <table>
                <tr><th>プラグイン名</th><th>バージョン</th></tr>
                ${items.join('\n')}
                </table>`;
    }
    install(plugin, callback) {
        if (plugin.indexOf('/') < 0) {
            // foo/bar 形式でない場合は npm が応答を返さないので先回りしてエラーにする
            callback(this.wrap(`<h4>${plugin}はインストールできません。"[githubユーザ名]/[githubプロジェクト名]"の形式を指定してください。</h4>`));
        }
        this.tryInstallForName(plugin, callback, () => {
            var parts = plugin.split('/');
            var atoksparkPretended = [parts[0], `atokspark-${parts[1]}`].join('/'); 
            this.tryInstallForName(atoksparkPretended, callback, (error) => {
                callback(this.wrap(`<h4>${plugin}のインストールに失敗しました。</h4>
                                <ul>
                                    <li>プラグイン名が間違っていませんか？
                                        <ul>
                                            <li>https://github.com/${plugin} を確認してください。</li>
                                        </ul>
                                    </li>
                                    <li>ネットワークに接続していますか？</li>
                                    <li>プロキシ設定は行われていますか？
                                        <ul>
                                            <li>Macでプラグインマネージャ(jspm)のみにプロキシ設定する場合はplugin.lstでhttps_proxy環境変数を設定してコマンドを記述してください。</li>
                                            <li>例) https_proxy=http://proxy.server:8080 path/to/node path/to/jspm.js</li>
                                        </ul>
                                    </li>
                                </ul>
                                <pre>${error}</pre>`))
            });
        });
    }
    tryInstallForName(plugin, callback, onError) {
        var url = `https://github.com/${plugin}.git`;
        // console.log(url);
        this.npm(`install --json --save ${url}`, (error, stdout, stderr) => {
            if (error) {
                onError(error);
                return;
            }
            this.restartPlugins(() => {
                this.list(`<h4>${plugin}をインストールしました。</h4>`, callback);
            });
        });
    }
    uninstall(plugin, callback) {
        this.tryUninstallForName(plugin, callback, () => {
            const atoksparkPretended = `atokspark-${plugin}`;
            this.tryUninstallForName(atoksparkPretended, callback, () => {
                this.list(`<h4>${plugin}はインストールされていません。</h4>`, callback);
            });
        });
    }
    tryUninstallForName(plugin, callback, onError) {
        if (nonPluginModules.indexOf(plugin) >= 0) {
            this.list(`<h4>プラグインマネージャの動作に必要なため、${plugin}をアンインストールできません。</h4>`, callback);
            return;
        }
        if (!this.isRunning(plugin)) {
            onError();
            return;
        }
        this.stopAllPlugins();
        this.npm(`uninstall --json --save ${plugin}`, (error, stdout, stderr) => {
            if (error) {
                callback(this.wrap(`<pre>${error}</pre>`))
                return;
            }
            this.restartPlugins(() => {
                this.list(`<h4>${plugin}をアンインストールしました。</h4>`, callback);
            });
        });
    }
    // private methods
    npm(args, callback) {
        var config = {
            cwd: __dirname,
            env: {
                'PATH': [path.dirname(process.execPath), process.env.PATH].join(':'),
            },
        };
        if (process.env.https_proxy) {
            config.env['https_proxy'] = process.env.https_proxy;
        }
        exec(`npm ${args}`, config, callback);
    }
    wrap(content) {
        return juice(`<html xmlns="http://www.w3.org/1999/xhtml"><body>${content}</body></html>`, {
            extraCss: jspmCSS,
            xmlMode: true,
        });
    }
}

const MAX_RESERVATIONS = 5;
const reservations = [];
let index = 0;

function reserveGetText(func) {
    reservations[index] = func;
    var token = index;
    index = (index + 1) % MAX_RESERVATIONS;
    return token;
}

var jspmViews = {
    'jspm:': function (callback) {
        pluginManager.list(null, callback);
    },
    'jspm:i:(.*):': function (callback, matches) {
        var plugin = matches[1].replace(':', '/');
        pluginManager.install(plugin, callback);
    },
    'jspm:u:(.*):': function (callback, matches) {
        var plugin = matches[1];
        pluginManager.uninstall(plugin, callback);
    }
};

var pluginManager = new PluginManager();
const jspmPlugin = new Plugin().run();
jspmPlugin.on('check', (text, callback) => {
    var checked = [];
    pluginManager.ensurePluginsStarted(() => {
        for (var regex of Object.keys(jspmViews)) {
            var matches = new RegExp(regex).exec(text);
            if (matches && matches[0] === text) {
                var view = jspmViews[regex];
                callback(['VIEW', reserveGetText((theCallback) => {
                    view(theCallback, matches);
                })]);
                return;
            }
        }

        // console.log('OK');
        if (pluginManager.runnings.length === 0) {
            callback(null);
            return;
        }
        // console.log(pluginManager.runnings);
        var handled = false;
        for (var plugin of pluginManager.runnings) {
            // console.log(`start checking on ${plugin.name}`);
            plugin.check(text, (thePlugin, result) => {
                // console.log(`${thePlugin.name} checked`);
                checked.push(thePlugin);
                if (handled) {
                    return;
                }
                if (result.indexOf('REPLACE ') === 0 ||
                    result.indexOf('VIEW ') === 0)
                {
                    // console.log(`from ${thePlugin.name}`);
                    var pair = result.split(' ');
                    var token = parseInt(pair[1]);
                    callback([pair[0], reserveGetText((theCallback) => {
                        thePlugin.gettext(token, (thePlugin, text) => {
                            var words = text.split(' ');
                            words.shift(); // 先頭の TEXT を外している
                            theCallback(words.join(' '));
                        });
                    })]);
                    handled = true;
                } else if (pluginManager.runnings.length === checked.length) {
                    // 他に結果を待っているやつがいなければ、結果なしを返す。
                    // console.log(`from ${thePlugin.name}`);
                    callback(null);
                }
            });
        }
    });
});
jspmPlugin.on('gettext', (token, callback) => {
    if (token < 0 || MAX_RESERVATIONS < token) {
        throw "無効な token です";
    }
    const reservedGetText = reservations[token];
    reservedGetText(callback);
});
