const path = require('path')
const TerserPlugin = require('terser-webpack-plugin')

module.exports = {
  target: 'node', // 因为是插件，所以目标是Node环境
  mode: 'production',
  entry: './src/index.ts', // 假设您的入口文件是src/index.ts
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    libraryTarget: 'commonjs2' // 适用于Node.js环境
  },
  resolve: {
    extensions: ['.ts', '.js', '.json']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false // 移除所有注释
          }
        },
        extractComments: false
      })
    ]
  },
  // 这里留空表示打包所有依赖
  externals: [],
  // 如果需要排除某些依赖，可以这样设置
  // externals: ['some-large-dependency'],

  // 包含源码映射以便调试
  devtool: 'source-map'
}
