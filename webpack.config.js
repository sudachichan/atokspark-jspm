var path = require('path');
var webpack = require('webpack');

module.exports = {
    entry: `${__dirname}/app/main.jsx`,
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: 'bundle.js'
    },
    module: {
        loaders: [
            {
                test: /.jsx?$/,
                loader: `${__dirname}/node_modules/babel-loader`,
                exclude: /node_modules/,
                query: {
                    presets: ['es2015', 'react']
                }
            }
        ]
    }
}
