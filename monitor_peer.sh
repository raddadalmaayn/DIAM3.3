#!/bin/bash

# This script provides a more accurate way to monitor the resource utilization of a single Docker container.
# It records the CPU % and Memory Usage at regular intervals to a specified CSV file.

# --- CONFIGURATION ---
TARGET_CONTAINER="peer0.org1.example.com"
OUTPUT_FILE="resource_usage.csv"
INTERVAL_SECONDS=1
# ---------------------

# Check if the target container exists
if [ -z "$(docker ps -q -f name=^/${TARGET_CONTAINER}$)" ]; then
    echo "Error: Target container '${TARGET_CONTAINER}' is not running."
    exit 1
fi

echo "--- Starting resource monitoring for ${TARGET_CONTAINER} ---"
echo "--- Press [Ctrl+C] to stop monitoring ---"
echo "Timestamp,ContainerName,CPU_Percent,Memory_Usage_MB" > ${OUTPUT_FILE}

# Loop to capture stats
while true; do
    # Get stats without streaming for a single, clean reading
    STATS=$(docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}}" ${TARGET_CONTAINER})
    
    # Extract and format the memory usage to MB
    MEM_USAGE=$(echo $STATS | awk -F'[,/]' '{print $3}' | sed 's/MiB//' | sed 's/GiB/ * 1024/' | bc)
    CPU_PERC=$(echo $STATS | awk -F',' '{print $2}' | sed 's/%//')
    NAME=$(echo $STATS | awk -F',' '{print $1}')
    TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%SZ")

    # Append to CSV
    echo "${TIMESTAMP},${NAME},${CPU_PERC},${MEM_USAGE}" >> ${OUTPUT_FILE}
    
    sleep ${INTERVAL_SECONDS}
done

