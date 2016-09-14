'use strict';

const Plugin = require('atokspark-jsplugin');
const child_process = require('child_process');
const exec = child_process.exec;
const fs = require('fs');
const juice = require('juice');
const path = require('path');

const jspmCSS = `
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
    constructor(name, version) {
        this.name = name;
        this.version = version;
        const pkgJson = JSON.parse(fs.readFileSync(`${__dirname}/node_modules/${this.name}/package.json`, 'utf8'));
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
            const text = '' + data;
            const lines = text.split('\n');
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
        this.plugins = [];
    }
    ensurePluginsStarted(ready) {
        if (this.plugins && this.plugins.length > 0) {
            // 起動済み
            ready();
            return;
        }
        this.npm('list --json', (error, stdout, stderr) => {
            const deps = JSON.parse(stdout).dependencies;
            for (const name of Object.keys(deps)) {
                if (nonPluginModules.indexOf(name) >= 0) {
                    // TODO: プラグインでないモジュールだった場合の処理はもう少し手厚くやる必要あり
                    continue;
                }
                const plugin = new PluginHost(name, deps[name].version);
                this.plugins.push(plugin);
                // console.log(`${plugin.name} created.`);
                // console.log(this.plugins);
            }
            if (this.plugins.length < 1) {
                // 1つもないが、制御は渡す。
                ready();
                return;
            }
            const acked = [];
            for (const plugin of this.plugins) {
                // console.log(plugin);
                plugin.start((thePlugin) => {
                    // console.log(`${thePlugin.name} started.`);
                    acked.push(thePlugin);
                    if (acked.length === this.plugins.length) {
                        ready();
                    }
                });
            }
        });
    }
    stopPlugins() {
        for (const plugin of this.plugins) {
            plugin.stop();
        }
        this.plugins = [];
    }
    restartPlugins(ready) {
        this.stopPlugins();
        this.ensurePluginsStarted(ready);
    }
    contains(name) {
        for (const item of this.plugins) {
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
        const rows = [];
        for (const plugin of this.plugins) {
            rows.push(`<tr><td>${plugin.name}</td><td>${plugin.version}</td></tr>`);
        }
        callback(this.wrap(`${message}
                            <h2>プラグイン一覧</h2>
                            <table>
                            <tr><th>プラグイン名</th><th>バージョン</th></tr>
                            ${rows.join('\n')}
                            </table>`));
    }
    install(plugin, callback) {
        if (plugin.indexOf('/') < 0) {
            // foo/bar 形式でない場合は npm が応答を返さないので先回りしてエラーにする
            callback(this.wrap(`<h4>${plugin}はインストールできません。"[githubユーザ名]/[githubプロジェクト名]"の形式を指定してください。</h4>`));
        }
        this.tryInstallForName(plugin, callback, () => {
            const parts = plugin.split('/');
            const atoksparkPretended = [parts[0], `atokspark-${parts[1]}`].join('/'); 
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
        const url = `https://github.com/${plugin}.git`;
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
        if (!this.contains(plugin)) {
            onError();
            return;
        }
        this.stopPlugins();
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
        const config = {
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
    const token = index;
    index = (index + 1) % MAX_RESERVATIONS;
    return token;
}

const jspmViews = {
    'jspm:': function (callback) {
        pluginManager.list(null, callback);
    },
    'jspm:i:(.*):': function (callback, matches) {
        const plugin = matches[1].replace(':', '/');
        pluginManager.install(plugin, callback);
    },
    'jspm:u:(.*):': function (callback, matches) {
        const plugin = matches[1];
        pluginManager.uninstall(plugin, callback);
    }
};

const pluginManager = new PluginManager();
const jspmPlugin = new Plugin().run();
jspmPlugin.on('check', (text, callback) => {
    const checked = [];
    pluginManager.ensurePluginsStarted(() => {
        for (const regex of Object.keys(jspmViews)) {
            const matches = new RegExp(regex).exec(text);
            if (matches && matches[0] === text) {
                const view = jspmViews[regex];
                callback(['VIEW', reserveGetText((theCallback) => {
                    view(theCallback, matches);
                })]);
                return;
            }
        }

        // console.log('OK');
        if (pluginManager.plugins.length === 0) {
            callback(null);
            return;
        }
        // console.log(pluginManager.plugins);
        let handled = false;
        for (const plugin of pluginManager.plugins) {
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
                    const pair = result.split(' ');
                    const token = parseInt(pair[1]);
                    callback([pair[0], reserveGetText((theCallback) => {
                        thePlugin.gettext(token, (thePlugin, text) => {
                            const words = text.split(' ');
                            words.shift(); // 先頭の TEXT を外している
                            theCallback(words.join(' '));
                        });
                    })]);
                    handled = true;
                } else if (pluginManager.plugins.length === checked.length) {
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
