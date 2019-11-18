const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const path = require('path');

const mode = process.env.NODE_ENV || 'development';
const prod = mode === 'production';

module.exports = {
    entry: {
        bundle: ['./src/main.js']
    },
    node: {
        fs: 'empty'
    },
    resolve: {
        alias: {
            svelte: path.resolve('node_modules', 'svelte'),
            'nahmii-ethereum-address': path.resolve('node_modules', 'nahmii-ethereum-address'),
            'ethers': path.resolve('node_modules', 'ethers'),
            'bson': path.resolve('node_modules', 'bson')
        },
        extensions: ['.mjs', '.js', '.svelte'],
        mainFields: ['svelte', 'browser', 'module', 'main']
    },
    output: {
        path: __dirname + '/public',
        filename: '[name].js',
        chunkFilename: '[name].[id].js'
    },
    module: {
        rules: [
            {
                test: /\.svelte$/,
                use: {
                    loader: 'svelte-loader',
                    options: {
                        emitCss: true,
                        hotReload: true
                    }
                }
            },
            {
                test: /\.(sa|sc|c)ss$/,
                use: [
                    'style-loader',
                    MiniCssExtractPlugin.loader,
                    'css-loader',
                    {
                        loader: 'sass-loader',
                        options: {
                            sassOptions: {
                                includePaths: [
                                    './theme',
                                    './node_modules'
                                ]
                            }
                        }
                    }
                ]
            }
        ],
        noParse: (content) => {
            const toUse = [
                'erc20',
                'ClientFund',
                'DriipSettlementChallengeByPayment',
                // 'DriipSettlementChallengeState',
                'DriipSettlementByPayment',
                'NullSettlementChallengeByPayment',
                // 'NullSettlementChallengeState',
                'NullSettlement',
                'Configuration'
            ];
            if (/nahmii-contract-abstractions-ropsten.*\.json/.test(content)) {
                for (const filename of toUse) {
                    if (content.includes(filename))
                        return false;
                }
                return true;
            }
            if (/nahmii-contract-abstractions.*\.json/.test(content)) 
                return true;
        }
    },
    mode,
    plugins: [
        new MiniCssExtractPlugin({
            filename: '[name].css'
        })
    ],
    devtool: prod ? false : 'source-map'
};