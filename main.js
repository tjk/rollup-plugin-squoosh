/* eslint-disable indent */
/* eslint-disable no-inner-declarations */
/* eslint-disable no-undef */
// Built-ins
import path from "path";
import fs from "fs";

// Plugin-specific
import chalk from "chalk";

// Returns a new object each time, so that it can't be modified (while it is exported)
// It is required to export this value for testing
export const getDefaultOptions = () =>
  JSON.parse(
    JSON.stringify({
      disable: false,
      exclude: "",
      imagesToOptimizePath: "./test/_imagesToOptimize/",
      moveToPath: "./test/_originalRawImages/",
      optimizeToPath: "./test/images/",
      preprocessOptions: {},
      mozjpeg: {},
      webp: {},
      avif: {},
      jxl: {},
      wp2: {},
      oxipng: {},
      encodeOptions: {},
    })
  );

const dropUndefinedKeys = (obj) =>
  Object.entries(obj).reduce((acc, [key, val]) => {
    if (typeof val !== "undefined") {
      acc[key] = val;
    }

    return acc;
  }, {});

export function squoosh(userOptions = {}) {
  // Default options
  const defaultOptions = getDefaultOptions();

  // Remove `undefined` user options
  userOptions = dropUndefinedKeys(userOptions);

  // Inject default plugin factories
  const allPluginsFactories = {
    mozjpeg: squooshMozJpeg,
    webp: squooshWebp,
    avif: squooshAvif,
    jxl: squooshJxl,
    wp2: squooshWp2,
    oxipng: squooshOxiPng,
    ...userOptions.encodeOptions,
  };

  // Get pairs to use array functions
  const allPluginsFactoriesPairs = Object.entries(allPluginsFactories);

  // Merge 1st level options
  const pluginOptions = { ...defaultOptions, ...userOptions };

  // Merge user options with defaults for each plugin
  allPluginsFactoriesPairs.reduce((pluginOptionsAcc, [pluginName]) => {
    // Remove `undefined` plugin user options
    const pluginUserOpts = dropUndefinedKeys(userOptions[pluginName] || {});

    pluginOptionsAcc[pluginName] = {
      ...defaultOptions[pluginName],
      ...pluginUserOpts,
    };

    return pluginOptionsAcc;
  }, pluginOptions);

  // Run factories
  pluginOptions.encodeOptions = allPluginsFactoriesPairs.map(
    ([pluginName, factoryFunction]) =>
      factoryFunction(pluginOptions[pluginName])
  );
  const logPrefix = "squoosh:";

  return {
    name: "squoosh",
    buildStart() {
      if (pluginOptions.verbose && pluginOptions.disable) {
        pluginOptions.disable
          ? console.log(
              chalk.yellow.bold(`${logPrefix} Skipping image optimizations.`)
            )
          : console.log(chalk.green.bold(`${logPrefix} Optimizing images...`));
      }
    },
    load() {
      if (!pluginOptions.disable) {
        (async () => {
          const files = await fs.promises.readdir(imagesToOptimizePath);

          for (const file of files) {
            if (file !== pluginOptions.exclude) {
              await libSquooshOptimize(file);
            } else {
              console.log(`${logPrefix} Skipping ${file}`);
            }
          }

          await imagePool.close();
        })();

        async function libSquooshOptimize(file) {
          const imagePath = path.join(imagesToOptimizePath, file);
          const moveOriginalToPath = path.join(moveToPath, file);
          const saveOptimizedImageToPath = path.join(
            optimizeToPath,
            path.parse(file).name
          );
          console.log({ imagePath });

          const image = imagePool.ingestImage(imagePath);
          await image.decoded; //Wait until the image is decoded before running preprocessors

          await image.preprocess(pluginOptions.preprocessOptions);
          await image.encode(pluginOptions.encodeOptions);

          for (const encodedImage of Object.values(image.encodedWith)) {
            const { extension, binary } = await encodedImage;
            const optimizedImagePath = `${saveOptimizedImageToPath}.${extension}`;
            fs.writeFile(optimizedImagePath, binary, (err) => {
              if (err) {
                throw err;
              }
              console.log({ optimizedImagePath });
            });
          }

          // move original image async
          await fs.promises.rename(imagePath, moveOriginalToPath);
        }
      }
    },
  };
}
