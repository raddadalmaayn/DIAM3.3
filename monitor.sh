#!/bin/bash

OUTPUT_FILE="resource_usage.csv"
echo "timestamp,container_name,cpu_percent,mem_usage" > $OUTPUT_FILE

echo "Starting resource monitoring... Press Ctrl+C to stop."

while true; do
  TIMESTAMP=$(date +%s)
  # Get stats for fabric containers, format as CSV, and append timestamp
  docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}}" | grep "peer\|orderer" | while read -r line; do
    echo "$TIMESTAMP,$line" >> $OUTPUT_FILE
  done
  sleep 2 # Collect data every 2 seconds
done
