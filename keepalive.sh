#!/bin/bash
# 微信机器人保活脚本
# crontab: */5 * * * * /root/keepalive.sh
PID=$(pgrep -f "python3 /root/wechat_bot.py")
if [ -z "$PID" ]; then
    echo "bot dead, restarting" >> /tmp/keepalive.log
    nohup python3 /root/wechat_bot.py > /tmp/wxbot.log 2>&1 &
else
    PORT_OK=$(ss -tlnp | grep 9000 | grep -c python)
    if [ "$PORT_OK" -eq "0" ]; then
        echo "port 9000 not listening, killing and restart" >> /tmp/keepalive.log
        kill $PID 2>/dev/null
        nohup python3 /root/wechat_bot.py > /tmp/wxbot.log 2>&1 &
    fi
fi
