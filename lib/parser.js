/*
* Copyright Broadcom, Inc. All Rights Reserved.
* SPDX-License-Identifier: Apache-2.0
*/

/* eslint-disable no-restricted-syntax */

const fs = require('fs');
const dot = require('dot-object');
const YAML = require('yaml');
const _ = require('lodash');

const utils = require('./utils');
const Parameter = require('./parameter');
const Section = require('./section');
const Metadata = require('./metadata');

/*
 * Returns a Metadata object
 * The objects within that wrapper object are parsed from the comments metadata
 * See metadata.js
 */
function parseMetadataComments(valuesFilePath, config) {
  /*  eslint-disable prefer-destructuring */

  const data = fs.readFileSync(valuesFilePath, 'UTF-8');
  const lines = data.split(/\r?\n/);

  const parsedValues = new Metadata();
  const paramRegex = new RegExp(`^\\s*${config.comments.format}\\s*${config.tags.param}\\s*([^\\s]+)\\s*(\\[.*?\\])?\\s*(.*)$`);
  const sectionRegex = new RegExp(`^\\s*${config.comments.format}\\s*${config.tags.section}\\s*(.*)$`);
  const descriptionStartRegex = new RegExp(`^\\s*${config.comments.format}\\s*${config.tags.descriptionStart}\\s*(.*)`);
  const descriptionContentRegex = new RegExp(`^\\s*${config.comments.format}\\s*(.*)`);
  const descriptionEndRegex = new RegExp(`^\\s*${config.comments.format}\\s*${config.tags.descriptionEnd}\\s*(.*)`);
  const skipRegex = new RegExp(`^\\s*${config.comments.format}\\s*${config.tags.skip}\\s*([^\\s]+)\\s*(.*)$`);
  const extraRegex = new RegExp(`^\\s*${config.comments.format}\\s*${config.tags.extra}\\s*([^\\s]+)\\s*(\\[.*?\\])?\\s*(.*)$`);

  // We assume there will always be a section before any parameter. At least one section is required
  let currentSection = null;
  let descriptionParsing = false;
  lines.forEach((line) => {
    // Parse param line
    const paramMatch = line.match(paramRegex);
    if (paramMatch && paramMatch.length > 0) {
      const param = new Parameter(paramMatch[1]);
      const modifiers = paramMatch[2] ? paramMatch[2].split('[')[1].split(']')[0] : '';
      param.modifiers = modifiers.split(',').filter((m) => m).map((m) => m.trim());
      param.description = paramMatch[3];
      if (currentSection) {
        param.section = currentSection.name;
        currentSection.addParameter(param);
      }
      parsedValues.addParameter(param);
    }

    // Parse section line
    const sectionMatch = line.match(sectionRegex);
    if (sectionMatch && sectionMatch.length > 0) {
      const section = new Section(sectionMatch[1]);
      parsedValues.addSection(section);
      currentSection = section;
    }

    // Parse section description end line
    const descriptionEndMatch = line.match(descriptionEndRegex);
    if (currentSection && descriptionParsing && descriptionEndMatch) {
      descriptionParsing = false;
    }

    // Parse section description content line between start and end
    const descriptionContentMatch = line.match(descriptionContentRegex);
    if (currentSection && descriptionParsing
        && descriptionContentMatch && descriptionContentMatch.length > 0) {
      currentSection.addDescriptionLine(descriptionContentMatch[1]);
    }

    // Parse section description start line
    const descriptionStartMatch = line.match(descriptionStartRegex);
    if (currentSection && !descriptionParsing && descriptionStartMatch) {
      descriptionParsing = true;
      if (descriptionStartMatch.length > 0 && descriptionStartMatch[1] !== '') {
        currentSection.addDescriptionLine(descriptionStartMatch[1]);
      }
    }

    // Parse skip line
    const skipMatch = line.match(skipRegex);
    if (skipMatch && skipMatch.length > 0) {
      const param = new Parameter(skipMatch[1]);
      param.skip = true;
      if (currentSection) {
        param.section = currentSection.name;
        currentSection.addParameter(param);
      }
      parsedValues.addParameter(param);
    }

    // Parse extra line
    const extraMatch = line.match(extraRegex);
    if (extraMatch && extraMatch.length > 0) {
      const param = new Parameter(extraMatch[1]);
      param.description = extraMatch[3];
      param.value = ''; // Set an empty string by default since it won't have a value in the actual YAML
      param.extra = true;
      if (currentSection) {
        param.section = currentSection.name;
        currentSection.addParameter(param);
      }
      parsedValues.addParameter(param);
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
      // TODO(miguelaeh):
      // Variable to avoid render in the schema parameters with dots in the keys.
      // the ocurrences of this variable inside this function must be deleted after fixing it.
      let renderInSchema = true;
      if (value === undefined) {
        // If the value is not found,
        // give a try to our function for complex keys like 'annotations.prometheus.io/scrape'
        value = _.get(valuesJSON, utils.getArrayPath(valuesJSON, valuePath));
        renderInSchema = false;
      }
      let type = typeof value;

      // Check if the value is a plain array, an array that only contains strings,
      // those strings should not have metadata, the metadata must exist for the array itself
      const valuePathSplit = valuePath.split('[');
      if (valuePathSplit.length > 1) {
        // The value is inside an array
        const arrayPrefix = utils.getArrayPrefix(valuePath);
        // Retrieve the value at arrayPrefix only if it's defined
        const array = _.get(valuesJSON, arrayPrefix);
        // Ensure array is actually defined and is an array
        if (Array.isArray(array)) {
          let isPlainArray = true; // Assume it is plain until we prove the opposite
          array.forEach((e) => {
            if (typeof e !== 'string') {
              isPlainArray = false;
            }
          });
          if (isPlainArray) {
            value = array;
            valuePath = arrayPrefix;
          }
        } else {
          console.error(`Expected array at ${arrayPrefix}, found ${typeof array}`);
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
        if (!param.value) param.value = value;
        param.type = type;
        resultValues.push(param);
        param.schema = renderInSchema;
      }
    }
  }

  return resultValues;
}

module.exports = {
  parseMetadataComments,
  createValuesObject,
};
