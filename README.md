# mocha-reporter-sonarqube

Mocha reporter for SonarQube / SonarCloud

See https://docs.sonarqube.org/latest/analysis/generic-test/#header-2 for details.

## Installation

```bash
npm i -D mocha-reporter-sonarqube
```

## Usage

```bash
mocha -R mocha-reporter-sonarqube -O filename=report.xml
```

if `filename` option is not specified, the report will be written to `process.stdout`.
