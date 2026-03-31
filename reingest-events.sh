#!/bin/bash

PROJECT_URL="https://zbomenuickrogthnsozb.supabase.co"
FUNCTION_NAME="afl-worker-games-events"
API_KEY="sb_publishable_k6xiezxTU_koBvECjko4kQ_ZDVsQrIP"

GAMES=(
3059
3060
3062
3063
3064
3065
3066
3067
3068
3070
3072
3073
3074
3075
3076
3077
3080
3081
3083
3086
3087
3090
3091
3092
3093
3094
3095
3097
3098
3099
3103
3105
3106
3107
3108
3109
3111
3112
3113
3115
3116
3118
3119
3120
3122
3125
3126
3127
3128
3129
3130
3131
3133
3134
3136
3138
3139
3140
3141
3142
3143
3148
3149
3150
3151
3153
3154
3157
3159
)

for GAME_ID in "${GAMES[@]}"; do
  echo "➡️ Fetching events for game $GAME_ID"

  curl -s -X POST \
    "$PROJECT_URL/functions/v1/$FUNCTION_NAME" \
    -H "Content-Type: application/json" \
    -H "apikey: $API_KEY" \
    -H "Authorization: Bearer $API_KEY" \
    -d "{\"vendor_game_id\": $GAME_ID}"

  echo ""
  sleep 0.3
done

echo "✅ Done"
