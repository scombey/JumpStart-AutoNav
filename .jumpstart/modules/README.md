# Jump Start Modules

Modules are pluggable add-on suites that extend the Jump Start framework with additional agents, templates, commands, and checks.

## Module Structure

Each module is a directory containing a `module.json` manifest and its resources:

```
modules/
  my-module/
    module.json          # Module manifest (required)
    agents/              # Additional agent personas
    templates/           # Additional templates
    commands/            # Additional slash commands
    checks/              # Additional quality checks
```

## Module Manifest (`module.json`)

See `.jumpstart/schemas/module.schema.json` for the full schema.

```json
{
  "name": "my-module",
  "version": "1.0.0",
  "description": "A custom Jump Start module",
  "author": "Your Name",
  "agents": ["agents/my-agent.md"],
  "templates": ["templates/my-template.md"],
  "commands": ["commands/my-commands.md"],
  "checks": []
}
```

## Installing Modules

1. Place the module directory inside `.jumpstart/modules/`
2. Add the module name to `modules.enabled` in `.jumpstart/config.yaml`
3. The framework will automatically load the module's agents, templates, and commands

## Creating Modules

Use the module manifest template: `.jumpstart/templates/module-manifest.json`

Validate with: `npx jumpstart-mode validate-module <module-dir>`

## Marketplace

Module packaging follows the schema defined in `.jumpstart/schemas/module.schema.json`. Future marketplace support will use `bin/lib/registry.js` for publishing and discovery.
