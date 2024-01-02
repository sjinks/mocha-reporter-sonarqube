# mocha-reporter-sonarqube

Mocha reporter for SonarQube / SonarCloud

See https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/test-coverage/generic-test-data/#generic-test-execution for details.

## Installation

```bash
npm i -D mocha-reporter-sonarqube
```

## Usage

```bash
mocha -R mocha-reporter-sonarqube -O filename=report.xml
```

if the `filename` option is not specified, the report will be written to `process.stdout`.
