#!/usr/bin/env bash
set -euo pipefail

package_path=${1:?usage: verify-package-runtime.sh /absolute/package.tgz}
project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
state_dir=$(mktemp -d /tmp/dabot-openclaw.XXXXXX)
trap 'rm -rf -- "$state_dir"' EXIT

export OPENCLAW_STATE_DIR="$state_dir/state"
export OPENCLAW_CONFIG_PATH="$state_dir/openclaw.json"
printf '{}\n' >"$OPENCLAW_CONFIG_PATH"

"$project_root/node_modules/.bin/openclaw" plugins install "npm-pack:$package_path" --force --accept-capabilities

cat >"$OPENCLAW_CONFIG_PATH" <<'JSON'
{
  "plugins": {
    "allow": ["discord-user-tipbot"],
    "entries": {
      "discord-user-tipbot": {
        "enabled": true,
        "config": {
          "token": { "source": "env", "provider": "default", "id": "DABOT_TEST_TOKEN" },
          "expectedUserId": "111111111111111111",
          "guildId": "222222222222222222",
          "contextId": "333333333333333333",
          "interactionMode": "dm",
          "tipBotApplicationId": "444444444444444444",
          "allowedRecipientIds": ["555555555555555555"],
          "allowedTokenSymbols": ["MSHL"],
          "tipEnabled": false,
          "receiptPath": "/tmp/dabot-test-receipts.jsonl"
        }
      }
    }
  }
}
JSON

DABOT_TEST_TOKEN=test-only-placeholder \
  "$project_root/node_modules/.bin/openclaw" plugins inspect discord-user-tipbot --runtime --json \
  >"$project_root/.runtime-inspect.json"

echo RUNTIME_INSPECT_READY
