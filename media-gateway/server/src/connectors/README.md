# connectors/

the only code that talks to the outside world, one folder per external system named by its role (llm/, database/, email/, payments/); the vendor goes inside (llm/anthropic.py). Timeouts, retries and logging of external calls live here.

May import: core, config, prompts, itself.

Part of the GroundWork code layout (STANDARD.md §5f). Run `groundwork.py layout` for the whole map.
