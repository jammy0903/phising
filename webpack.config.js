const path = require('path');
const Dotenv = require('dotenv-webpack');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: process.env.NODE_ENV === 'production' ? false : 'cheap-module-source-map',
  entry: {
    popup: './src/pages/popup/index.tsx',
    options: './src/pages/options/index.tsx',
    'temp-data': './src/pages/temp-data/index.tsx',
    background: './src/background/index.ts',
    contentScript: './src/contentScript/index.ts',
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
          'style-loader',
          'css-loader',
          {
            loader: 'postcss-loader'
          },
        ],
      },
    ],
  },
  resolve: {
    fallback: {
      async_hooks: false,
      https: require.resolve('https-browserify'),
      http: require.resolve('stream-http'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer/'),
      os: require.resolve('os-browserify/browser'),
      assert: require.resolve('assert/'),
      crypto: require.resolve('crypto-browserify'),
      vm: require.resolve('vm-browserify'),
      querystring: require.resolve('querystring-es3'),
      fs: false,
      net: false,
      tls: false,
      path: require.resolve('path-browserify'),
      zlib: require.resolve('browserify-zlib'),
      url: require.resolve('url/'),
      dgram: false,
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
  optimization: {
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
      chunks: 'all',
      minSize: 20000,
      minChunks: 1,
      maxAsyncRequests: 30,
      maxInitialRequests: 30,
      cacheGroups: {
        defaultVendors: {
          test: /[\\/]node_modules[\\/]/,
          priority: -10,
          reuseExistingChunk: true,
        },
        default: {
          minChunks: 2,
          priority: -20,
          reuseExistingChunk: true,
        },
      },
    },
  },
  plugins: [
    new Dotenv({
      systemvars: true,
      safe: true,
      silent: true,
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser',
    }),
    new webpack.IgnorePlugin({
      resourceRegExp: /defaultable/,
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/manifest.json', to: '' }, // manifest.json 복사
        { from: 'src/assets', to: 'assets' }, // 필요 시 추가 리소스 복사
      ],
    }),
  ],
  performance: {
    hints: process.env.NODE_ENV === 'production' ? 'warning' : false,
  },
};
