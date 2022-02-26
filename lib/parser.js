/*
* Copyright 2021-2021 VMware, Inc.
* SPDX-License-Identifier: Apache-2.0
*/

/* eslint-disable no-restricted-syntax */

const dot = require('dot-object');
const fs = require('fs');
const YAML = require('yaml');
const _ = require('lodash');
const axios = require('axios');

const utils = require('./utils');
const Parameter = require('./parameter');
const { resolve } = require('path');

/*
 * Returns an array of Parameters
 * The array is parsed from the comments metadata
 * See parameter.js
 */
function parseMetadataComments(valuesFilePath, config) {
  /*  eslint-disable prefer-destructuring */

  const data = fs.readFileSync(valuesFilePath, 'UTF-8');
  const lines = data.split(/\r?\n/);

  const parsedValues = [];
  const paramRegex = new RegExp(`^\\s*${config.comments.format}\\s*${config.tags.param}\\s*([^\\s]+)\\s*(\\[.*?\\])?\\s*(.*)$`);
  const sectionRegex = new RegExp(`^\\s*${config.comments.format}\\s*${config.tags.section}\\s*(.*)$`);
  const skipRegex = new RegExp(`^\\s*${config.comments.format}\\s*${config.tags.skip}\\s*(.*)$`);
  const extraRegex = new RegExp(`^\\s*${config.comments.format}\\s*${config.tags.extra}\\s*([^\\s]+)\\s*(\\[.*?\\])?\\s*(.*)$`);

  let currentSection = ''; // We assume there will always be a section before any parameter. At least one section is required
  lines.forEach((line) => {
    // Parse param line
    const paramMatch = line.match(paramRegex);
    if (paramMatch && paramMatch.length > 0) {
      const param = new Parameter(paramMatch[1]);
      param.modifier = paramMatch[2] ? paramMatch[2].split('[')[1].split(']')[0] : '';
      param.description = paramMatch[3];
      param.section = currentSection;
      parsedValues.push(param);
    }

    // Parse section line
    const sectionMatch = line.match(sectionRegex);
    if (sectionMatch && sectionMatch.length > 0) {
      currentSection = sectionMatch[1];
    }

    // Parse skip line
    const skipMatch = line.match(skipRegex);
    if (skipMatch && skipMatch.length > 0) {
      const param = new Parameter(skipMatch[1]);
      param.skip = true;
      param.section = currentSection;
      parsedValues.push(param);
    }

    // Parse extra line
    const extraMatch = line.match(extraRegex);
    if (extraMatch && extraMatch.length > 0) {
      const param = new Parameter(extraMatch[1]);
      param.description = extraMatch[3];
      param.value = ''; // Set an empty string by default since it won't have a value in the actual YAML
      param.extra = true;
      param.section = currentSection;
      parsedValues.push(param);
    }
  });

  return parsedValues;
}

/*
 * Returns an array of Parameters parsed from the actual YAML content
 * This object contains the actual type and value of the object
 */
function createValuesObject(valuesFilePath) {
  const resultValues = [];
  const valuesJSON = YAML.parse(fs.readFileSync(valuesFilePath, 'utf8'));
  const dottedFormatProperties = dot.dot(valuesJSON);

  for (let valuePath in dottedFormatProperties) {
    if (Object.prototype.hasOwnProperty.call(dottedFormatProperties, valuePath)) {
      let value = _.get(valuesJSON, valuePath);
      let type = typeof value;

      // Check if the value is a plain array, an array that only contains strings,
      // those strings should not have metadata, the metadata must exist for the array itself
      const valuePathSplit = valuePath.split('[');
      if (valuePathSplit.length > 1) {
        // The value is inside an array
        const arrayPrefix = utils.getArrayPrefix(valuePath);
        let isPlainArray = true; // Assume it is plain until we prove the opposite
        _.get(valuesJSON, arrayPrefix).forEach((e) => {
          if (typeof e !== 'string') {
            isPlainArray = false;
          }
        });
        if (isPlainArray) {
          value = _.get(valuesJSON, arrayPrefix);
          valuePath = arrayPrefix;
        }
      }

      // Map the javascript 'null' to golang 'nil'
      if (value === null) {
        value = 'nil';
      }

      // When an element is an object it can be object or array
      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          type = 'array';
        }
      }

      // The existence check is needed to avoid duplicate plain array keys
      if (!resultValues.find((v) => v.name === valuePath)) {
        const param = new Parameter(valuePath);
        param.value = value;
        param.type = type;
        resultValues.push(param);
      }
    }
  }

  return resultValues;
}

/*
 * Returns the array of Parameters after appending the cart dependencies
 */
async function appendDependencies(chartPath, valuesMetadata) {
  const chart = YAML.parse(fs.readFileSync(chartPath, 'utf8'));

  let requests = [];

  console.log(`INFO: receiving home pages...`);
  for (const depencencyChart of chart.dependencies) {
    const repositoryUrl = depencencyChart.repository + "/index.yaml";

    requests.push(axios.get(repositoryUrl).then((response) => {
      const param =  new Parameter(depencencyChart.name);
      const homeUrl = YAML.parse(response.data).entries[depencencyChart.name][0].home;
      param.description = `For additional variables configurations please refer [here](${homeUrl})`;
      param.validate = false;
      
      for (let index=0; index < valuesMetadata.length; index++) {
        const parameterName = valuesMetadata[index].name;
        const parameterFirstNameMatch = parameterName.match(/([^.]+)[.]/);
        const parameterFirstName = parameterFirstNameMatch ? parameterFirstNameMatch[1] : '';

        if (parameterFirstName === depencencyChart.name) {
          param.section = valuesMetadata[index].section;
          valuesMetadata.splice(index, 0, param);
          break;
        }
      }

    }));
  }

  await Promise.all(requests);
  console.log(`INFO: successfully received home pages!`);
}

module.exports = {
  parseMetadataComments,
  createValuesObject,
  appendDependencies,
};
