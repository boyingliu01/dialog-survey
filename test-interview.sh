#!/bin/bash
API="http://localhost:3000"

echo "=== 1. 获取模板列表 ==="
curl -s "$API/api/templates" | jq '.templates[0]'

echo -e "\n=== 2. 启动访谈 ==="
RESPONSE=$(curl -s -X POST "$API/api/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Test-Mode: true" \
  -d '{"msgtype":"text","text":{"content":"开始"},"senderStaffId":"test-user-001","conversation_id":"test-conv-001"}')

echo "$RESPONSE" | jq '.'
SESSION_ID=$(echo "$RESPONSE" | jq -r '.session_id')
echo "Session ID: $SESSION_ID"

echo -e "\n=== 3. 回答问题 1 ==="
curl -s -X POST "$API/api/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Test-Mode: true" \
  -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"产品质量很好，性能稳定\"},\"senderStaffId\":\"test-user-001\",\"session_id\":\"$SESSION_ID\"}" | jq '.message'

echo -e "\n=== 4. 回答问题 2 ==="
curl -s -X POST "$API/api/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Test-Mode: true" \
  -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"服务响应很快，态度很好\"},\"senderStaffId\":\"test-user-001\",\"session_id\":\"$SESSION_ID\"}" | jq '.message'

echo -e "\n=== 5. 回答问题 3 ==="
curl -s -X POST "$API/api/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Test-Mode: true" \
  -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"希望能增加更多功能\"},\"senderStaffId\":\"test-user-001\",\"session_id\":\"$SESSION_ID\"}" | jq '.message'

echo -e "\n=== 测试完成 ==="