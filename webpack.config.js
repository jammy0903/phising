const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack = require('webpack');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: process.env.NODE_ENV === 'production' ? false : 'cheap-module-source-map',
  entry: {
    popup: path.resolve(__dirname, 'src/pages/popup/index.tsx'),
    options: path.resolve(__dirname, 'src/pages/options/index.tsx'),
    'temp-data': path.resolve(__dirname, 'src/pages/temp-data/index.tsx'),
    background: path.resolve(__dirname, 'src/background/index.ts'),
    contentScript: path.resolve(__dirname, 'src/contentScript/index.ts')
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              experimentalWatchApi: true,
            },
          },
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1
            }
          },
          'postcss-loader'
        ],
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name][ext]'
        }
      },
    ],
  },
  resolve: {
    fallback: {
      // 제거할 모듈들
      path: false,
      dns: false,
      fs: false,
      net: false,
      tls: false,
      async_hooks: false,
      https: false,
      http: false,
      stream: false,
      crypto: false,
      os: false,
      url: false,
      assert: false,
      util: false,
      buffer: false,
      querystring: false,
      zlib: false,
      dgram: false,
      vm: false,
    },
    extensions: ['.tsx', '.ts', '.js', '.jsx', '.css'],
    alias: {
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@styles': path.resolve(__dirname, 'src/styles'),
      '@components': path.resolve(__dirname, 'src/components'),
    },
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),
    new Dotenv({
      systemvars: true,
      safe: true,
      silent: true,
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser',
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'public',
          to: '',
          globOptions: {
            ignore: ['*.html']
          }
        },
        {
          from: "manifest.json",
          to: "manifest.json",
          transform(content) {
            return Buffer.from(JSON.stringify({
              ...JSON.parse(content.toString()),
              version: process.env.npm_package_version,
            }, null, 2));
          },
        },
        {
          from: "src/styles/global.css",
          to: "contentStyle.css"
        }
      ],
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'public/popup.html'),
      filename: 'popup-[chunk hash].html',
      chunks: ['popup'],
      cache: false,
      minify: false,
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'public/options.html'),
      filename: 'options-[chunkhash].html',
      chunks: ['options'],
      cache: false,
      minify: false,
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'public/temp-data.html'),
      filename: 'temp-data-[chunkhash].html',
      chunks: ['temp-data'],
      cache: false,
      minify: false,
    }),
  ],
  optimization: {
    runtimeChunk: 'single',
    minimize: process.env.NODE_ENV === 'production',
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false,
          },
          compress: {
            drop_console: process.env.NODE_ENV === 'production',
            drop_debugger: true,
          },
        },
        extractComments: false,
      }),
      new CssMinimizerPlugin(),
    ],
    splitChunks: {
      chunks: 'async',
      minSize: 20000,
    }
  }
};