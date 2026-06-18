# Template UI Configuration

## Files in this directory

- **`defaults.yaml`** - Default configuration (shipped with code, DO NOT EDIT)
- **`settings.yaml`** - Your custom configuration (gitignored, optional)
- **`examples/`** - Example configurations you can copy

## Quick Start

1. Copy an example: `cp examples/production.yaml settings.yaml`
2. Edit `settings.yaml` with your custom values
3. Restart the server: `npm start`

## Configuration Files

- If `settings.yaml` exists, it merges with `defaults.yaml` (your values override defaults)
- If `settings.yaml` doesn't exist, defaults are used
- Environment variables can override both (see `env.template`)

## Examples

See `examples/` directory for:
- `production.yaml` - Clean production template
- `blue-theme.yaml` - Blue color scheme variant
- `minimal.yaml` - Minimal auth-disabled setup

For full documentation, see the main README.md "Customizing Branding & Features" section.
