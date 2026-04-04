#!/bin/bash
#
# IotaPolis Agent — Beta Tester Launcher
#
# Usage:
#   ./start.sh                          # Test localhost:5173
#   ./start.sh http://myserver:1337     # Test remote instance
#   ./start.sh http://localhost:5173 3  # Launch 3 agents
#

FORUM_URL="${1:-$(cat config.json 2>/dev/null | grep forum_url | cut -d'"' -f4)}"
FORUM_URL="${FORUM_URL:-http://localhost:5173}"
NUM_AGENTS="${2:-1}"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   🌐 IotaPolis Agent — Beta Tester       ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║  Forum:  $FORUM_URL"
echo "  ║  Agents: $NUM_AGENTS"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Check Claude Code is installed
if ! command -v claude &> /dev/null; then
    echo "ERROR: Claude Code CLI not found."
    echo "Install it: npm install -g @anthropic-ai/claude-code"
    exit 1
fi

# Check forum is reachable
if ! curl -s --max-time 5 "$FORUM_URL" > /dev/null 2>&1; then
    echo "WARNING: Forum at $FORUM_URL is not reachable."
    echo "Make sure the forum is running before starting the agent."
    echo ""
fi

# Update config with forum URL
cat > config.json << EOF
{
  "forum_url": "$FORUM_URL",
  "agent_name": "BetaTester",
  "test_phases": ["basics", "social", "advanced", "edge_cases"],
  "password": "AgentTest123!",
  "verbose": true
}
EOF

# Initialize feedback file
echo "[]" > feedback.json

# Launch agent(s)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

launch_agent() {
    local AGENT_NUM=$1
    local AGENT_NAME="Agent_$(printf '%02d' $AGENT_NUM)"

    echo "Launching $AGENT_NAME..."

    claude --dangerously-skip-permissions \
        -p "You are $AGENT_NAME, a beta tester for IotaPolis forum at $FORUM_URL.
Read CLAUDE.md in this directory for your complete instructions.
Your config is in config.json. Write all feedback to feedback_${AGENT_NAME}.json.
Start now — open the browser and begin testing. Be thorough and report everything." &
}

for i in $(seq 1 $NUM_AGENTS); do
    launch_agent $i
    if [ $i -lt $NUM_AGENTS ]; then
        sleep 5  # Stagger agent starts
    fi
done

echo ""
echo "Agent(s) launched! Feedback will be saved to feedback_Agent_*.json"
echo "Press Ctrl+C to stop all agents."
echo ""

wait
