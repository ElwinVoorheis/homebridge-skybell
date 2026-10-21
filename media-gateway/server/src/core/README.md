# core/

business rules and use cases. Pure code: no network, database, SDKs or env vars. It defines the interfaces it needs (e.g. core/ports.py) and connectors implement them.

May import: prompts, itself.

Part of the GroundWork code layout (STANDARD.md §5f). Run `groundwork.py layout` for the whole map.
