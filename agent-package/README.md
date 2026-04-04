# IotaPolis Agent — AI Beta Tester

An AI-powered beta tester that automatically explores and tests your IotaPolis forum instance.

## Requirements

- [Claude Code](https://claude.com/claude-code) CLI installed (`npm install -g @anthropic-ai/claude-code`)
- A running IotaPolis forum instance
- Chrome browser (for browser automation)

## Quick Start

```bash
# 1. Unzip the package
unzip iotapolis-agent.zip
cd iotapolis-agent

# 2. Make the script executable
chmod +x start.sh

# 3. Launch the agent
./start.sh
```

That's it! The agent will:
1. Open your forum in Chrome
2. Create a wallet and register
3. Test every feature (posts, votes, DMs, governance, marketplace...)
4. Write detailed feedback to `feedback_Agent_01.json`

## Options

```bash
# Test a specific forum URL
./start.sh http://your-forum:1337

# Launch 3 agents simultaneously
./start.sh http://localhost:5173 3

# Launch 5 agents on a remote server
./start.sh https://forum.example.com 5
```

## What Gets Tested

| Phase | Features |
|-------|----------|
| **Basics** | Homepage, threads, replies, votes, search, profile |
| **Social** | Reactions, notifications, DMs, follows |
| **Advanced** | Wallet, marketplace, governance, mobile layout |
| **Edge Cases** | Empty inputs, XSS, invalid URLs, permissions |

## Output

Each agent writes a `feedback_Agent_XX.json` file with structured findings:

```json
[
  {
    "phase": 1,
    "feature": "thread_creation",
    "status": "pass",
    "description": "Thread created successfully, appeared in category list",
    "type": "suggestion",
    "severity": "low",
    "screenshot": "Thread title truncated at 50 chars in sidebar"
  }
]
```

## Customize

Edit `config.json` to change:
- `forum_url` — target forum
- `agent_name` — prefix for agent names
- `test_phases` — which phases to run
- `password` — wallet password for the agent

Edit `CLAUDE.md` to modify the agent's testing instructions.

## Multiple Agents

When launching multiple agents, each one:
- Gets its own wallet (unique mnemonic)
- Registers with a unique username
- Tests independently
- Writes to its own feedback file
- Can interact with other agents (reply, tip, follow)

## License

MIT — Part of the IotaPolis project.
