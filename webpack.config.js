const path = require('path');

function createConfig(entry, isProduction, isAbsolutePath) {

  // определение абсолютного или относительного пути для асинхронный чанков
  let outputPath = (isAbsolutePath ? '/' : '') + 'scripts/';


  return {
    mode: isProduction ? 'production' : 'development',
    output: {
      filename: '[name].js',
      // chunkFilename: '[name].bundle.js',
      publicPath: outputPath
    },
    devtool: isProduction ? false : 'inline-source-maps',
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: [
            path.resolve(__dirname, 'node_modules'),
          ],
          use: ['babel-loader'],
        }
      ],
    },
    resolve: {
      alias: {
        // 'vue$': 'vue/dist/vue.esm.js' // 'vue/dist/vue.common.js' for webpack 1
      }
    },
    plugins: [],
    optimization: {
      // splitChunks: {
      //   cacheGroups: {
      //     commons: {
      //       chunks: "initial",
      //       minChunks: 1,
      //       maxInitialRequests: 2, 
      //       minSize: 10000
      //     }
      //   }
      // }
    },

    performance: {
      hints: false,
    },


  };

}

module.exports = createConfig();
module.exports.createConfig = createConfig;
