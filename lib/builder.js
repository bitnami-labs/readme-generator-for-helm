/*
* Copyright Broadcom, Inc. All Rights Reserved.
* SPDX-License-Identifier: Apache-2.0
*/

/* eslint-disable no-restricted-syntax */

const { cloneDeep } = require('lodash');

/*
 * Sets the proper value for the provided parameter taking into account its modifiers.
 * IMPORTANT: the last modifier takes precedence when it changes the default value
 */
/* eslint no-param-reassign: ["error", { "props": false }] */
function applyModifiers(param, config) {
  // Hack for nullable parameters.
  // If there are several modifiers and nullable is the last one,
  // we just want to change the type and not the value.
  // This case is used to change the type on the schema only, maintaining the original value
  const index = (param.modifiers.findIndex((m) => m === config.modifiers.nullable)) + 1;
  if (!(index === param.modifiers.length)) {
    param.modifiers.forEach((modifier) => {
      switch (modifier) {
        case `${config.modifiers.array}`:
          param.value = '[]';
          break;
        case `${config.modifiers.object}`:
          param.value = '{}';
          break;
        case `${config.modifiers.string}`:
          param.value = '""';
          break;
        case `${config.modifiers.number}`:
          break;
        case `${config.modifiers.nullable}`:
          // Do nothing since the nullable parameters must preserve its default value
          // unless another modifier is applied at the same time. In that case, the second
          // modifier specifies the default value.
          break;
        case modifier.match(new RegExp(`${config.modifiers.default}:.*`))?.input: {
          const defaultSpacesRegex = `${config.modifiers.default}:\\s*`;
          param.value = modifier.replace(new RegExp(defaultSpacesRegex), '');
          break;
        }
        default:
          throw new Error(`Unknown modifier: ${modifier} for parameter ${param.name}`);
      }
    });
  }
}

/*
* Returns the array of Parameters after combining the information from the actual YAML with
* the parsed from the comments:
* Params:
*   - valuesObject: object with the real values built from the YAML.
*   - valuesMetadata: full metadata object parsed from comments
* Returns: array of Parameters with all the needed information about them
* IMPORTANT: the array returned will have fields that should not be rendered on the README and
*            fields that should not be rendered in the schema. They will be selected later.
*/
function combineMetadataAndValues(valuesObject, valuesMetadata) {
  for (const param of valuesMetadata) {
    // The parameters with extra do not appear in the actual object and don't have a value
    if (!param.extra) {
      const paramIndex = valuesObject.findIndex((e) => e.name === param.name);
      if (paramIndex !== -1) {
        // Set the value from actual object if not set before
        if (!param.value) param.value = valuesObject[paramIndex].value;
        param.type = valuesObject[paramIndex].type;
        // TODO(miguelaeh): Hack to avoid render parameters with dots in keys into the schema.
        // Must be removed once fixed
        param.schema = valuesObject[paramIndex].schema;
      }
    }
  }

  // Add missing parameters to the metadata.
  // For example, the skip parameters are not parsed from metadata but must be in the array
  // to be rendered in the OpenAPI schema
  for (const param of valuesObject) {
    let paramIndex = valuesMetadata.findIndex((e) => e.name === param.name);
    if (paramIndex === -1) {
      // Find the position of the skip parameter
      paramIndex = valuesObject.findIndex((e) => e.name.startsWith(param.name));
      param.skip = true; // Avoid to render it on the READMEs
      param.schema = true;
      // Push the parameter after the skip object
      valuesMetadata.splice(paramIndex + 1, 0, param);
    }
  }
}

/*
* Returns the Parameter list that will be rendered in the README
*/
function buildParamsToRenderList(parametersList, config) {
  let returnList = cloneDeep(parametersList);
  for (const param of returnList) {
    // Modify values following modifiers, except for nullable parameters
    // that must preserve its value
    if (param.modifiers) {
      applyModifiers(param, config);
    }
    // The skip parameters must not be rendered in the README
    returnList = returnList.filter((p) => (!p.skip));
  }

  return returnList;
}

module.exports = {
  combineMetadataAndValues,
  buildParamsToRenderList,
};
