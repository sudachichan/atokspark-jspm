'use strict';

const Plugin = require('atokspark-jsplugin');
const exec = require('child_process').exec;
const path = require('path');

var config = {
    cwd: __dirname,
    env: {
        'PATH': [path.dirname(process.execPath), process.env.PATH].join(':'),
    },
};
function npm(args, callback) {
    exec(`npm ${args}`,config, callback);
}

function wrap(content) {
    return `<html xmlns="http://www.w3.org/1999/xhtml"><body ${style.body}>${content}</body></html>`;
}

var style = css({
    body: {
        backgroundColor: 'black',
        color: 'white',
        fontFamily: 'monospace',
    },
    h2: {
        borderBottom: '1px solid #99ccff',
    },
    h4: {
        backgroundColor: '#003366',
        padding: '1em',
    },
    th: {
        backgroundColor: '#336699',
        padding: '0.5em 1em',
    },
    td: {
        backgroundColor: '#003366',
        padding: '0.5em 1em',
    },
});
function css(json) {
    var converted = {};
    for (var selector of Object.keys(json)) {
        var props = [];
        var rules = json[selector];
        for (var key of Object.keys(rules)) {
            var value = rules[key];
            props.push(`${propName(key)}: ${propValue(value)}`);
        }
        converted[selector] = `style="${props.join('; ')}"`;
    }
    return converted;
}
function propName(key) {
    var prop = '';
    for (var i = 0; i < key.length; ++i) {
        var char = key[i];
        if ('A' <= char && char <= 'Z') {
            prop += `-${char.toLowerCase()}`
        } else {
            prop += char;
        }
    }
    return prop;
}
function propValue(value) {
    if (value instanceof Number) {
        value = `${value}px`;
    }
    return value;
}

function renderJSON(s, title) {
        const deps = JSON.parse(s).dependencies;
        var items = [];
        for (var key of Object.keys(deps)) {
            items.push(`<tr><td ${style.td}>${key}</td><td ${style.td}>${deps[key].version}</td></tr>`);
        }
        return wrap(`<h2 ${style.h2}>${title}</h2>
                     <table>
                     <tr><th ${style.th}>プラグイン名</th><th ${style.th}>バージョン</th></tr>
                     ${items.join('\n')}
                     </table>`);
}
function listPlugins(callback, message) {
    npm('list --json', (error, stdout, stderr) => {
        var list = renderJSON(stdout, 'プラグイン一覧');
        callback(`${message}
        ${list}`);
    });
}

Plugin.byRules({
    async: true,
    replaces: {
        'jspm2:': function (callback) {
            callback('hello');
        },
    },
    views: {
        'jspm:': (callback) => {
            npm('list --json', (error, stdout, stderr) => {
                callback(renderJSON(stdout, 'プラグイン一覧'));
            });
        },
        'jspm:i:(.*):': (callback, matches) => {
            var plugin = matches[1].replace(':', '/');
            var url = `git://github.com/${plugin}.git`;
            // console.log(url);
            npm(`install --json --save ${url}`, (error, stdout, stderr) => {
                if (error) {
                    callback(wrap(`<pre>${error}</pre>`))
                    return;
                }
                listPlugins(callback, `<h4 ${style.h4}>${plugin}をインストールしました。</h4>`);
            });
        },
        'jspm:u:(.*):': (callback, matches) => {
            var plugin = matches[1];
            // console.log(url);
            if (plugin === 'atokspark-jsplugin') {
                listPlugins(callback, `<h4 ${style.h4}>プラグインマネージャの動作に必要なため、${plugin}をアンインストールできません。</h4>`);
                return;
            }
            npm(`uninstall --json --save ${plugin}`, (error, stdout, stderr) => {
                if (error) {
                    callback(wrap(`<pre>${error}</pre>`))
                    return;
                }
                listPlugins(callback, `<h4 ${style.h4}>${plugin}をアンインストールしました。</h4>`);
            });
        },
    },
});
