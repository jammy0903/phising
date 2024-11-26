const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack = require('webpack');

class ManifestUpdatePlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tapAsync('ManifestUpdatePlugin', (compilation, callback) => {
      const fs = require('fs');
      const path = require('path');
      const manifestPath = path.join(compiler.options.output.path, 'manifest.json');

      try {
        // 생성된 파일들에서 HTML 파일 찾기
        const assets = Object.keys(compilation.assets);
        const popupFile = assets.find(f => f.startsWith('popup-') && f.endsWith('.html'));
        const optionsFile = assets.find(f => f.startsWith('options-') && f.endsWith('.html'));

        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath));
          if (popupFile) {
            manifest.action.default_popup = popupFile;
          }
          if (optionsFile) {
            manifest.options_page = optionsFile;
          }
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        }

        callback();
      } catch (error) {
        console.error('Error in ManifestUpdatePlugin:', error);
        callback();
      }
    });
  }
}

const pages = {
  popup: {
    entry: 'src/pages/popup/index.tsx',
    template: './public/popup.html',
    filename: 'popup-[chunkhash].html',
  },
  options: {
    entry: 'src/pages/options/index.tsx',
    template: './public/options.html',
    filename: 'options-[chunkhash].html',
  },
  'temp-data': {
    entry: 'src/pages/temp-data/index.tsx',
    template: './public/temp-data.html',
    filename: 'temp-data-[chunkhash].html',
  },
};

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: process.env.NODE_ENV === 'production' ? false : 'cheap-module-source-map',
  entry: {
    ...Object.keys(pages).reduce((acc, name) => ({
      ...acc,
      [name]: path.resolve(__dirname, pages[name].entry),
    }), {}),
    background: path.resolve(__dirname, 'src/background/index.ts'),
    contentScript: path.resolve(__dirname, 'src/contentScript/index.ts'),
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react', '@babel/preset-typescript'],
            },
          },
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader'],
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name][ext]',
        },
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx', '.css'],
    alias: {
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@styles': path.resolve(__dirname, 'src/styles'),
      '@components': path.resolve(__dirname, 'src/components'),
    },
    fallback: {
      path: false,
      crypto: false,
      stream: false,
      http: false,
      https: false,
      zlib: false,
      util: false,
      net: false,
      tls: false,
      dns: false,
      fs: false,
      buffer: false,
      querystring: false,
      url: false,
      async_hooks: false,
      assert: false,
      os: false,
      dgram: false,
      vm: false,
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
      React: 'react',
    }),
    ...Object.keys(pages).map(name =>
        new HtmlWebpackPlugin({
          template: path.resolve(__dirname, pages[name].template),
          filename: pages[name].filename,
          chunks: ['vendors', name],
          cache: false,
          minify: false,
          inject: 'body',
        })
    ),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'public',
          to: '',
          globOptions: {
            ignore: ['*.html'], // HTML 파일 복사 제외
          },
        },
        {
          from: 'manifest.json',
          to: 'manifest.json',
          transform(content) {
            return JSON.stringify(JSON.parse(content.toString()), null, 2);
          },
        },
        {
          from: 'src/styles',
          to: 'styles',
        },
      ],
    }),
    new ManifestUpdatePlugin(), // 추가된 플러그인
  ],
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
      chunks: 'all', // 모든 청크에 대해 분할 적용
      name: 'vendors',
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: -10,
        },
        default: {
          minChunks: 2,
          priority: -20,
          reuseExistingChunk: true,
        },
      },
    },
  },
};
