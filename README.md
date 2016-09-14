# atokspark-jspm

node.js で動作する ATOK Spark プラグインを管理するプラグインです。

## 使い方の例

`jspm:` と入力すると、インストール済みのプラグイン一覧を表示します。
`jspm:i:sudachichan:jsplugin-sample:` (または省略せず `jspm:i:sudachichan:atokspark-jsplugin-sample:`)と入力すると、 http://github.com/sudachichan/atokspark-jsplugin-sample.git がインストールされます。
`jspm:u:jsplugin-sample:` (または省略せず `jspm:u:atokspark-jsplugin-sample:`)と入力すると、同プラグインがアンインストールされます。

このプラグインは、管理している JavaScript プラグインを自動的に実行します。 ATOK Spark の plugin.lst ファイルを都度編集する必要はありません。

## How to run

以下のコマンドでエラーが出なければ動作するはずです。(まだ動作していません。)
```
$ git clone https://github.com/sudachichan/atokspark-jspm.git
$ cd atokspark-jspm
$ npm update
$ npm run test
```

なお、 ATOK Spark の plugin.lst には以下のように指定してください。(Mac, nodebrew で node.js をインストールしている場合の例)
```
/Users/YOUR_ACCOUNT/.nodebrew/current/bin/node PATH/TO/jspm.js
```
- `YOUR_ACCOUNT`: あなたのユーザ名
- `PATH/TO/jspm.js`: jspm.js がチェックアウトされたパス
