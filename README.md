# Readme Generator For Helm

- Autogenerate Helm Charts READMEs' tables based on values YAML file metadata.
- Autogenerate an OpenAPI compliant JSON schema defining the `values.yaml` structure of the Helm Chart. The file generated will be a JSON file formatted according to the [OpenAPIv3 SchemaObject](https://spec.openapis.org/oas/v3.1.0#schema-object) definition.

## How it works

The tool expects some metadata for the descriptions in the provided `values.yaml` file. It will parse and check the metadata against the real values.
If the metadata is consistent with the real values, it will generate and insert the values table into the provided `README.md` file.
If the metadata is not correct, it will print the full list of errors. It checks whether there is metadata for non-existing values or there is missing metadata for an existing value.

The table that will be inserted into the `readme.md` will have the following structure:

```markdown
## Parameters

### Section 1 title

| Name      | Description             | Default        |
|:----------|:------------------------|:---------------|
| `value_1` | Description for value 1 | `defaultValue` |
| `value_2` | Description for value 2 | `defaultValue` |
| `value_3` | Description for value 3 | `defaultValue` |

### Section 2 title

| Name      | Description             | Default        |
|:----------|:------------------------|:---------------|
| `value_1` | Description for value 1 | `defaultValue` |
| `value_2` | Description for value 2 | `defaultValue` |
| `value_3` | Description for value 3 | `defaultValue` |

...
```

The number of `#` characters needed for the section titles is dynamically calculated, and the title of the `Parameters` section can be configured via the [configuration file](#configuration-file). The `README.md` file with a `## Parameters` section must be created before running the tool, the `Parameters` section should have two `#` or more symbols.

## Requirements

The project has been developed and tested with node version `16.x`.

## Install

Execute the following commands to install the tool:

```console
git clone https://github.com/bitnami/readme-generator-for-helm
npm install ./readme-generator-for-helm
```

Depending on how you installed NodeJS in your system, you may need to modify your `PATH` environment variable to be able to execute the tool.

## Single Binary

Execute the following commands to create a single executable binary for the tool:

```console
git clone https://github.com/bitnami/readme-generator-for-helm
cd ./readme-generator-for-helm
npm install
npm install -g pkg
pkg . -o readme-generator-for-helm
```

## Test

We use [Jest](https://jestjs.io) to implement the tests. In order to test your changes, execute the following command:

```console
npm run-script test
```

### Lint

After modifying the code execute the following command to pass the linter:

```console
npm run-script lint
```

## Basic usage

```console
Usage: readme-generator [options]

Options:
  -v, --values <path>  Path to the values.yaml file
  -r, --readme <path>  Path to the README.md file
  -c, --config <path>  Path to the config file
  -s, --schema <path>  Path for the OpenAPI Schema output file
  --version            Show Readme Generator version
  -h, --help           display help for command
```

## values.yaml Metadata

For the tool to work, you need to add some metadata to your `values.yaml` file.

By default we use a format similar to Javadoc, using `@xxx` for tags followed by the tag structure.

The following are the tags supported at this very moment:

- For a parameter: `## @param fullKeyPath [modifier?] Description`.
- For a section: `## @section Section Title"`.
- To skip an object and all its children: `## @skip fullKeyPath Description?`.
- To add a description for an intermediate object (i.e. not final in the YAML tree): `## @extra fullkeyPath Description`.

All the tags as well as the two initial `#` characters for the comments style can be configured in the [configuration file](#configuration-file).

> IMPORTANT: tags' order or position in the file is NOT important except for the @section tag. The @section that will include in the section all the parameters after it until a new section is found or the file ends.

The `modifier` is optional and it will change how the parameter is processed.
Several modifiers can be applied by separating them using commas (`,`). When affecting the value, the last one takes precedence.

Currently supported modifiers:

- `[array]` Indicates that the value of the parameter must be set to `[]`.
- `[object]` Indicates that the value of the parameter must be set to `{}`.
- `[string]` Indicates that the value of the parameter must be set to `""`.
- `[number]` Indicates that the value of the parameter must be set to a number (ex. `0`).
- `[nullable]` Indicates that the parameter value can be set to `null`.
- `[default: DEFAULT_VALUE]` Sets the default value to `DEFAULT_VALUE`.

The modifiers are also customizable via the [configuration file](#configuration-file).

In case you are adding a `custom modifier` to a parameter that does not have value in the values file
you must add one of the `supported modifiers` as last modifier.

Example:

Values file

```yaml
# @param noDefaultValue [number, nullable] Description
# noDefaultValue: 1
```

Custom configuration snippet:

```json
{
  ...
    "modifiers": {
    "array": "array",
    "object": "object",
    "string": "string",
    "number": "number",
    "nullable": "nullable"
  },
  ...
}
```

## Configuration file

The configuration file has the following structure:

```json
{
  "comments": {
    "format": "##"                               <-- Which is the comments format in the values YAML
  },
  "tags": {
    "param": "@param",                           <-- Tag that indicates a parameter
    "section": "@section",                       <-- Tag that indicates a section
    "descriptionStart": "@descriptionStart",     <-- Tag that indicates the beginning of a section description
    "descriptionEnd": "@descriptionEnd",         <-- Tag that indicates the end of a section description
    "skip": "@skip",                             <-- Tag that indicates the object must be skipped
    "extra": "@extra"                            <-- Tag to add a description for an intermediate object
  },
  "modifiers": {
    "array": "array",                            <-- Modifier that indicates an array type
    "object": "object",                          <-- Modifier that indicates an object type
    "string": "string",                          <-- Modifier that indicates a string type
    "number": "number",                           <-- Modifier that indicates a number type
    "nullable": "nullable"                      <-- Modifier that indicates a parameter that can be set to null
  },
  "regexp": {
    "paramsSectionTitle": "Parameters"           <-- Title of the parameters section to replace in the README.md
  }
}
```

## Pre-commit

Add this to your `.pre-commit-config.yaml`:

```yaml
- repo: https://github.com/bitnami/readme-generator-for-helm
  rev: "main"
  hooks:
    - id: helm-readme-generator
      # in order to run helm-readme-generator only once
      pass_filenames: false
      always_run: true
      # default args are [--readme=chart/README.md, --values=chart/values.yaml]
      args: [--readme=path/to/README.md, --values=path/to/values.yaml]
```

## Versions

### 2.4.0

Add `descriptionStart` and `descriptionEnd` config options (default tags: `@descriptionStart` and `@descriptionEnd`)
to allow text block upfront each section table in README.md. When changing the tag values for these, ensure to not being conflicted
with `section` config option.

If you are using a customized [configuration file](#configuration-file), please add the new default tags to prevent any incorrect behavior.

### 2.0.0

The `-m (--metadata)` option has been renamed to `-s (--schema)` in order to properly identify what it generates.

## License

Copyright &copy; 2024 Broadcom. The term "Broadcom" refers to Broadcom Inc. and/or its subsidiaries.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

<http://www.apache.org/licenses/LICENSE-2.0>

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
