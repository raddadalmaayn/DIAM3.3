# DIAM3.3 Provenance
# Lightweight Provenance for Additive Manufacturing using Hyperledger Fabric

This repository contains the source code and instructions for a blockchain-based proof-of-concept designed to provide a lightweight, efficient, and auditable provenance trail for components produced via Additive Manufacturing (AM).

The core of this project is a Hyperledger Fabric smart contract (chaincode) that implements a hybrid data model. Essential, verifiable data for each lifecycle event is stored on-chain, while a cryptographic hash links to voluminous off-chain data (e.g., machine logs, CAD files, QA reports), thus ensuring scalability and cost-effectiveness.

## 1. Prerequisites

Before you begin, ensure you have the following installed on your **Ubuntu** system:

* **curl** and **git**
* **Go** (Version 1.21.x or higher)
* **Docker** and **Docker Compose**

## 2. Setup and Deployment

These steps will guide you through setting up the Hyperledger Fabric test network, creating the chaincode, and deploying it.

### Step 2.1: Install Prerequisites and Fabric Samples

If you haven't already set up the environment, run the following commands in your Ubuntu terminal.

```bash
# Update package lists and install essential tools
sudo apt-get update
sudo apt-get -y install curl git build-essential

# Install Docker
sudo apt-get -y install apt-transport-https ca-certificates gnupg-agent software-properties-common
curl -fsSL [https://download.docker.com/linux/ubuntu/gpg](https://download.docker.com/linux/ubuntu/gpg) | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] [https://download.docker.com/linux/ubuntu](https://download.docker.com/linux/ubuntu) $(lsb_release -cs) stable"
sudo apt-get update
sudo apt-get -y install docker-ce docker-ce-cli containerd.io

# Add your user to the docker group (Requires logout/login)
sudo usermod -aG docker $USER
echo "IMPORTANT: Please log out and log back in now to apply Docker permissions."
# After logging back in, proceed.

# Install Go
wget [https://go.dev/dl/go1.21.0.linux-amd64.tar.gz](https://go.dev/dl/go1.21.0.linux-amd64.tar.gz)
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz
rm go1.21.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.profile
source ~/.profile

# Download Fabric Samples and Binaries
mkdir -p $HOME/fabric
cd $HOME/fabric
curl -sSLO [https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh](https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh) && chmod +x install-fabric.sh
./install-fabric.sh docker samples binary
```

### Step 2.2: Start the Fabric Test Network

Navigate to the test network directory and start the network. This creates two organizations, their peers, and an ordering service.

```bash
cd $HOME/fabric/fabric-samples/test-network
./network.sh up createChannel -c mychannel -ca
```
Your network should now be running. You can verify this with `docker ps`.

### Step 2.3: Create the Chaincode

1.  **Create the directory for our chaincode:**
    ```bash
    mkdir -p $HOME/fabric/fabric-samples/chaincode/am-provenance
    ```

2.  **Create the Go source file** `am_provenance.go` inside that new directory and add the following code:

    ```go
    // File: $HOME/fabric/fabric-samples/chaincode/am-provenance/am_provenance.go
    package main

    import (
    	"encoding/json"
    	"fmt"
    	"time"

    	"[github.com/hyperledger/fabric-contract-api-go/contractapi](https://github.com/hyperledger/fabric-contract-api-go/contractapi)"
    )

    // SmartContract provides functions for managing AM provenance
    type SmartContract struct {
    	contractapi.Contract
    }

    // Asset represents the core item being tracked on the blockchain.
    type Asset struct {
    	AssetID             string   `json:"assetID"`
    	Owner               string   `json:"owner"`
    	CurrentLifecycleStage string `json:"currentLifecycleStage"`
    	HistoryTxIDs        []string `json:"historyTxIDs"`
    }

    // ProvenanceEvent defines the structure for our lightweight on-chain records.
    type ProvenanceEvent struct {
    	EventType         string `json:"eventType"`
    	AgentID           string `json:"agentID"`
    	Timestamp         string `json:"timestamp"`
    	OffChainDataHash  string `json:"offChainDataHash"`
    	MaterialType           string `json:"materialType,omitempty"`
    	MaterialBatchID        string `json:"materialBatchID,omitempty"`
    	SupplierID             string `json:"supplierID,omitempty"`
    	DesignFileHash         string `json:"designFileHash,omitempty"`
    	DesignFileVersion      string `json:"designFileVersion,omitempty"`
    	MachineID              string `json:"machineID,omitempty"`
    	MaterialBatchUsedID    string `json:"materialBatchUsedID,omitempty"`
    	BuildJobID             string `json:"buildJobID,omitempty"`
    	PrimaryInspectionResult string `json:"primaryInspectionResult,omitempty"`
    	TestStandardApplied    string `json:"testStandardApplied,omitempty"`
    	FinalTestResult        string `json:"finalTestResult,omitempty"`
    	CertificateID          string `json:"certificateID,omitempty"`
    }

    // recordEvent is an internal helper function
    func (s *SmartContract) recordEvent(ctx contractapi.TransactionContextInterface, event ProvenanceEvent) (string, error) {
    	txID := ctx.GetStub().GetTxID()
    	event.Timestamp = time.Now().UTC().Format(time.RFC3339)

    	eventJSON, err := json.Marshal(event)
    	if err != nil {
    		return "", fmt.Errorf("failed to marshal event JSON: %v", err)
    	}

    	err = ctx.GetStub().PutState("EVENT_"+txID, eventJSON)
    	if err != nil {
    		return "", fmt.Errorf("failed to put event state: %v", err)
    	}
    	return txID, nil
    }

    // CreateMaterialCertification records the certification of a new batch of raw material.
    func (s *SmartContract) CreateMaterialCertification(ctx contractapi.TransactionContextInterface, assetID string, materialType string, materialBatchID string, supplierID string, offChainDataHash string) error {
    	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
    	if err != nil {
    		return fmt.Errorf("failed to get client MSPID: %v", err)
    	}
    	exists, err := s.AssetExists(ctx, assetID)
    	if err != nil {
    		return err
    	}
    	if exists {
    		return fmt.Errorf("the asset %s already exists", assetID)
    	}
    	event := ProvenanceEvent{
    		EventType:       "MATERIAL_CERTIFICATION",
    		AgentID:         clientMSPID,
    		OffChainDataHash:  offChainDataHash,
    		MaterialType:    materialType,
    		MaterialBatchID: materialBatchID,
    		SupplierID:      supplierID,
    	}
    	txID, err := s.recordEvent(ctx, event)
    	if err != nil {
    		return err
    	}
    	asset := Asset{
    		AssetID:             assetID,
    		Owner:               clientMSPID,
    		CurrentLifecycleStage: "MATERIAL_CERTIFIED",
    		HistoryTxIDs:        []string{txID},
    	}
    	assetJSON, err := json.Marshal(asset)
    	if err != nil {
    		return err
    	}
    	return ctx.GetStub().PutState(assetID, assetJSON)
    }
    
    // ... (All other chaincode functions: CreatePrintJobStart, CreatePrintJobCompletion, CreateQACertify, etc.) ...
    
    // ReadAsset returns the asset stored in the world state with the given id.
    func (s *SmartContract) ReadAsset(ctx contractapi.TransactionContextInterface, assetID string) (*Asset, error) {
    	assetJSON, err := ctx.GetStub().GetState(assetID)
    	if err != nil {
    		return nil, fmt.Errorf("failed to read from world state: %v", err)
    	}
    	if assetJSON == nil {
    		return nil, fmt.Errorf("the asset %s does not exist", assetID)
    	}
    	var asset Asset
    	err = json.Unmarshal(assetJSON, &asset)
    	if err != nil {
    		return nil, err
    	}
    	return &asset, nil
    }

    // GetAssetHistory returns the full provenance history of an asset.
    func (s *SmartContract) GetAssetHistory(ctx contractapi.TransactionContextInterface, assetID string) ([]*ProvenanceEvent, error) {
    	asset, err := s.ReadAsset(ctx, assetID)
    	if err != nil {
    		return nil, err
    	}
    	var history []*ProvenanceEvent
    	for _, txID := range asset.HistoryTxIDs {
    		eventKey := "EVENT_" + txID
    		eventJSON, err := ctx.GetStub().GetState(eventKey)
    		if err != nil {
    			fmt.Printf("Warning: could not retrieve event for txID %s: %v\n", txID, err)
    			continue
    		}
    		if eventJSON == nil {
    			fmt.Printf("Warning: no event found for txID %s\n", txID)
    			continue
    		}
    		var event ProvenanceEvent
    		err = json.Unmarshal(eventJSON, &event)
    		if err != nil {
    			fmt.Printf("Warning: could not unmarshal event for txID %s: %v\n", txID, err)
    			continue
    		}
    		history = append(history, &event)
    	}
    	return history, nil
    }

    // AssetExists returns true when asset with given ID exists in world state
    func (s *SmartContract) AssetExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {
    	assetJSON, err := ctx.GetStub().GetState(id)
    	if err != nil {
    		return false, fmt.Errorf("failed to read from world state: %v", err)
    	}
    	return assetJSON != nil, nil
    }

    func main() {
    	chaincode, err := contractapi.NewChaincode(&SmartContract{})
    	if err != nil {
    		fmt.Printf("Error creating AM provenance chaincode: %v", err)
    		return
    	}
    	if err := chaincode.Start(); err != nil {
    		fmt.Printf("Error starting AM provenance chaincode: %v", err)
    	}
    }
    ```

3.  **Prepare the Go module dependencies:**
    ```bash
    cd $HOME/fabric/fabric-samples/chaincode/am-provenance
    go get [github.com/hyperledger/fabric-contract-api-go/contractapi](https://github.com/hyperledger/fabric-contract-api-go/contractapi)
    go mod vendor
    ```

### Step 2.4: Deploy and Test the Chaincode

1.  **Navigate back to the `test-network` directory:**
    ```bash
    cd $HOME/fabric/fabric-samples/test-network
    ```
2.  **Deploy the chaincode.** Use the absolute path to your chaincode folder.
    ```bash
    ./network.sh deployCC -ccn amprovenance -ccp $HOME/fabric/fabric-samples/chaincode/am-provenance -ccl go
    ```
    Wait for the command to complete successfully.

3.  **Test the chaincode by invoking a transaction.**
    * First, set the environment variables to act as Org1's admin:
        ```bash
        export PATH=${PWD}/../bin:$PATH
        export FABRIC_CFG_PATH=$PWD/../config/
        export CORE_PEER_TLS_ENABLED=true
        export CORE_PEER_LOCALMSPID="Org1MSP"
        export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/[org1.example.com/peers/peer0.org1.example.com/tls/ca.crt](https://org1.example.com/peers/peer0.org1.example.com/tls/ca.crt)
        export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/[org1.example.com/users/Admin@org1.example.com/msp](https://org1.example.com/users/Admin@org1.example.com/msp)
        export CORE_PEER_ADDRESS=localhost:7051
        ```
    * Now, invoke the chaincode to create a material batch. This command gets the required signatures from both Org1 and Org2.
        ```bash
        peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "${PWD}/organizations/ordererOrganizations/[example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem](https://example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem)" -C mychannel -n amprovenance --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/[org1.example.com/peers/peer0.org1.example.com/tls/ca.crt](https://org1.example.com/peers/peer0.org1.example.com/tls/ca.crt)" --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/[org2.example.com/peers/peer0.org2.example.com/tls/ca.crt](https://org2.example.com/peers/peer0.org2.example.com/tls/ca.crt)" -c '{"function":"CreateMaterialCertification","Args":["MATERIAL_BATCH_001", "Ti6Al4V", "POWDER-XYZ-789", "SupplierCorpMSP", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"]}'
        ```
4.  **Query the ledger to verify the transaction.**
    ```bash
    # Wait a few seconds for the block to commit
    sleep 3
    
    # Query for the asset
    peer chaincode query -C mychannel -n amprovenance -c '{"Args":["ReadAsset","MATERIAL_BATCH_001"]}'
    ```
    **Expected Output:**
    ```json
    {"assetID":"MATERIAL_BATCH_001","owner":"Org1MSP","currentLifecycleStage":"MATERIAL_CERTIFIED","historyTxIDs":["..."]}
    ```

## 3. Troubleshooting

* **`permission denied while trying to connect to the Docker daemon`**: You did not log out and log back in after being added to the `docker` group. Alternatively, run `newgrp docker` in your terminal to start a new shell session with the correct permissions.
* **`cannot find module providing package...` or `no dependencies to vendor`**: You missed a step in preparing the Go module. Navigate to your chaincode directory (`chaincode/am-provenance`) and run `go get ...` followed by `go mod vendor`.
* **`invalid character U+005C '\'`**: You have extra backslashes in your Go source code from a bad copy-paste. Recopy the "clean" version of the code into the file.
* **`endorsement policy failure`**: Your `invoke` command did not get signatures from all required organizations. Make sure your `peer chaincode invoke` command includes the `--peerAddresses` flags for both Org1 and Org2.

## 4. Cleanup

To shut down the Fabric test network and remove all containers, run the following command from the `test-network` directory:

```bash
./network.sh down




4. Performance Analysis (KPI Measurement)
In this section, we measure the Transaction Latency to quantitatively compare our lightweight model against a naive model that stores large data payloads on-chain.

4.1. Measuring Lightweight Model Latency (Baseline)
We will invoke the CreateMaterialCertification function three times and measure the wall-clock time for each transaction to establish a performance baseline.

Set Environment Variables: Configure your terminal to act as Org1's admin.

# Run these from the test-network directory
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/[org1.example.com/peers/peer0.org1.example.com/tls/ca.crt](https://org1.example.com/peers/peer0.org1.example.com/tls/ca.crt)
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/[org1.example.com/users/Admin@org1.example.com/msp](https://org1.example.com/users/Admin@org1.example.com/msp)
export CORE_PEER_ADDRESS=localhost:7051

Run the tests: Use the time command and invoke the chaincode with unique asset IDs for each run.

# Run #1
time peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "${PWD}/organizations/ordererOrganizations/[example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem](https://example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem)" -C mychannel -n amprovenance --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/[org1.example.com/peers/peer0.org1.example.com/tls/ca.crt](https://org1.example.com/peers/peer0.org1.example.com/tls/ca.crt)" --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/[org2.example.com/peers/peer0.org2.example.com/tls/ca.crt](https://org2.example.com/peers/peer0.org2.example.com/tls/ca.crt)" -c '{"function":"CreateMaterialCertification","Args":["MATERIAL_BATCH_002", "Ti6Al4V", "POWDER-ABC-123", "SupplierCorpMSP", "f2d81a260dea8d14f0f044c4188c89b43332d3493e8f370851a705128723f5d5"]}'

# Run #2
time peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "${PWD}/organizations/ordererOrganizations/[example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem](https://example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem)" -C mychannel -n amprovenance --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/[org1.example.com/peers/peer0.org1.example.com/tls/ca.crt](https://org1.example.com/peers/peer0.org1.example.com/tls/ca.crt)" --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/[org2.example.com/peers/peer0.org2.example.com/tls/ca.crt](https://org2.example.com/peers/peer0.org2.example.com/tls/ca.crt)" -c '{"function":"CreateMaterialCertification","Args":["MATERIAL_BATCH_003", "Ti6Al4V", "POWDER-DEF-456", "SupplierCorpMSP", "a6e1a2d189196724a8e2f0d9a5b3a1c0d8e2f0d9a5b3a1c0d8e2f0d9a5b3a1c0"]}'

# Run #3
time peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "${PWD}/organizations/ordererOrganizations/[example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem](https://example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem)" -C mychannel -n amprovenance --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/[org1.example.com/peers/peer0.org1.example.com/tls/ca.crt](https://org1.example.com/peers/peer0.org1.example.com/tls/ca.crt)" --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/[org2.example.com/peers/peer0.org2.example.com/tls/ca.crt](https://org2.example.com/peers/peer0.org2.example.com/tls/ca.crt)" -c '{"function":"CreateMaterialCertification","Args":["MATERIAL_BATCH_004", "Inconel718", "POWDER-GHI-789", "SupplierCorpMSP", "b7f1b2e189196724a8e2f0d9a5

## 5. Analysing

https://g.co/gemini/share/f9a73166be43

import json

def calculate_byte_size(data_dict):
    """Serializes a Python dictionary to a JSON string and returns its size in bytes."""
    # Using separators=(',', ':') creates the most compact JSON representation.
    json_string = json.dumps(data_dict, separators=(',', ':'))
    return len(json_string.encode('utf-8'))

# --- Define a sample event for each lifecycle stage ---
# These structures match our Go chaincode exactly.
# We include a 64-character hex string for the SHA-256 hash.
off_chain_hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

# 1. Material Certification
material_cert_event = {
    "eventType": "MATERIAL_CERTIFICATION",
    "agentID": "Org1MSP",
    "timestamp": "2025-06-08T10:00:00Z",
    "offChainDataHash": off_chain_hash,
    "materialType": "Ti6Al4V",
    "materialBatchID": "POWDER-XYZ-789",
    "supplierID": "SupplierCorpMSP"
}

# 2. Design Finalization (Not in chaincode, but part of lifecycle)
# For the sake of analysis, we'll create a hypothetical event for it.
design_event = {
    "eventType": "DESIGN_FINALIZATION",
    "agentID": "Org1MSP",
    "timestamp": "2025-06-08T11:00:00Z",
    "offChainDataHash": off_chain_hash, # This would be the hash of the STL file
    "designFileHash": off_chain_hash,
    "designFileVersion": "v2.1.3"
}

# 3. Print Job Start
print_start_event = {
    "eventType": "PRINT_JOB_START",
    "agentID": "Org1MSP",
    "timestamp": "2025-06-08T12:00:00Z",
    "offChainDataHash": off_chain_hash,
    "machineID": "EOS-M290-SN123",
    "materialBatchUsedID": "MATERIAL_BATCH_001",
    "designFileHash": off_chain_hash,
    "buildJobID": "BUILD-06082025-01"
}

# 4. Print Job Completion
print_complete_event = {
    "eventType": "PRINT_JOB_COMPLETION",
    "agentID": "Org1MSP",
    "timestamp": "2025-06-08T22:00:00Z",
    "offChainDataHash": off_chain_hash,
    "buildJobID": "BUILD-06082025-01",
    "primaryInspectionResult": "PASS"
}

# 5. Post-Processing (Hypothetical event for analysis)
post_process_event = {
    "eventType": "POST_PROCESS_HEAT_TREATMENT",
    "agentID": "Org1MSP",
    "timestamp": "2025-06-09T09:00:00Z",
    "offChainDataHash": off_chain_hash
}

# 6. QA & Certification
qa_cert_event = {
    "eventType": "QA_CERTIFY",
    "agentID": "Org2MSP", # A different org does the QA
    "timestamp": "2025-06-09T14:00:00Z",
    "offChainDataHash": off_chain_hash,
    "testStandardApplied": "AS9100",
    "finalTestResult": "CERTIFIED_FIT_FOR_USE",
    "certificateID": "QA-CERT-951"
}

# --- Calculate and print the sizes ---
size_material = calculate_byte_size(material_cert_event)
size_design = calculate_byte_size(design_event)
size_start = calculate_byte_size(print_start_event)
size_complete = calculate_byte_size(print_complete_event)
size_post = calculate_byte_size(post_process_event)
size_qa = calculate_byte_size(qa_cert_event)
total_lightweight = size_material + size_design + size_start + size_complete + size_post + size_qa

print("--- On-Chain Data Footprint (Lightweight Model) ---")
print(f"1. Material Certification Event: {size_material} bytes")
print(f"2. Design Finalization Event:    {size_design} bytes")
print(f"3. Print Job Start Event:        {size_start} bytes")
print(f"4. Print Job Completion Event:   {size_complete} bytes")
print(f"5. Post-Processing Event:        {size_post} bytes")
print(f"6. QA & Certification Event:     {size_qa} bytes")
print("-----------------------------------------------------")
print(f"TOTAL ON-CHAIN FOOTPRINT:        {total_lightweight} bytes")


### Step 5: the naive model

    package main

    import (
    	"encoding/json"
    	"fmt"
    	"time"

    	"github.com/hyperledger/fabric-contract-api-go/contractapi"
    )

    // SmartContract provides functions for managing AM provenance
    type SmartContract struct {
    	contractapi.Contract
    }

    // =========================================================================================
    //                             DATA STRUCTURES
    // =========================================================================================

    // Asset represents the core item being tracked on the blockchain.
    type Asset struct {
    	AssetID             string   `json:"assetID"`
    	Owner               string   `json:"owner"`
    	CurrentLifecycleStage string `json:"currentLifecycleStage"`
    	HistoryTxIDs        []string `json:"historyTxIDs"`
    }

    // ProvenanceEvent defines the structure for our lightweight on-chain records.
    type ProvenanceEvent struct {
    	EventType         string `json:"eventType"`
    	AgentID           string `json:"agentID"`
    	Timestamp         string `json:"timestamp"`
    	OffChainDataHash  string `json:"offChainDataHash,omitempty"` // Omit if empty for Naive model
    	OnChainDataPayload string `json:"onChainDataPayload,omitempty"` // For Naive model
    	MaterialType           string `json:"materialType,omitempty"`
    	MaterialBatchID        string `json:"materialBatchID,omitempty"`
    	SupplierID             string `json:"supplierID,omitempty"`
    	DesignFileHash         string `json:"designFileHash,omitempty"`
    	DesignFileVersion      string `json:"designFileVersion,omitempty"`
    	MachineID              string `json:"machineID,omitempty"`
    	MaterialBatchUsedID    string `json:"materialBatchUsedID,omitempty"`
    	BuildJobID             string `json:"buildJobID,omitempty"`
    	PrimaryInspectionResult string `json:"primaryInspectionResult,omitempty"`
    	TestStandardApplied    string `json:"testStandardApplied,omitempty"`
    	FinalTestResult        string `json:"finalTestResult,omitempty"`
    	CertificateID          string `json:"certificateID,omitempty"`
    }

    // =========================================================================================
    //                             CHAINCODE FUNCTIONS
    // =========================================================================================

    // recordEvent is an internal helper function that creates a new ProvenanceEvent,
    // stores it on the ledger using its transaction ID as the key, and returns the txID.
    func (s *SmartContract) recordEvent(ctx contractapi.TransactionContextInterface, event ProvenanceEvent) (string, error) {
    	txID := ctx.GetStub().GetTxID()
    	event.Timestamp = time.Now().UTC().Format(time.RFC3339)

    	eventJSON, err := json.Marshal(event)
    	if err != nil {
    		return "", fmt.Errorf("failed to marshal event JSON: %v", err)
    	}

    	err = ctx.GetStub().PutState("EVENT_"+txID, eventJSON)
    	if err != nil {
    		return "", fmt.Errorf("failed to put event state: %v", err)
    	}
    	return txID, nil
    }


    // CreateMaterialCertification records the certification of a new batch of raw material.
    // This is our efficient LIGHTWEIGHT model.
    func (s *SmartContract) CreateMaterialCertification(ctx contractapi.TransactionContextInterface, assetID string, materialType string, materialBatchID string, supplierID string, offChainDataHash string) error {
    	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
    	if err != nil {
    		return fmt.Errorf("failed to get client MSPID: %v", err)
    	}
    	exists, err := s.AssetExists(ctx, assetID)
    	if err != nil {
    		return err
    	}
    	if exists {
    		return fmt.Errorf("the asset %s already exists", assetID)
    	}
    	event := ProvenanceEvent{
    		EventType:       "MATERIAL_CERTIFICATION_LIGHTWEIGHT",
    		AgentID:         clientMSPID,
    		OffChainDataHash:  offChainDataHash,
    		MaterialType:    materialType,
    		MaterialBatchID: materialBatchID,
    		SupplierID:      supplierID,
    	}
    	txID, err := s.recordEvent(ctx, event)
    	if err != nil {
    		return err
    	}
    	asset := Asset{
    		AssetID:             assetID,
    		Owner:               clientMSPID,
    		CurrentLifecycleStage: "MATERIAL_CERTIFIED",
    		HistoryTxIDs:        []string{txID},
    	}
    	assetJSON, err := json.Marshal(asset)
    	if err != nil {
    		return err
    	}
    	return ctx.GetStub().PutState(assetID, assetJSON)
    }

    // #######################################################################################
    // #                            NEW NAIVE MODEL FUNCTION                                 #
    // #######################################################################################

    // CreateMaterialCertification_Naive records the certification by storing the ENTIRE data payload on-chain.
    // This is our inefficient NAIVE model for performance comparison.
    func (s *SmartContract) CreateMaterialCertification_Naive(ctx contractapi.TransactionContextInterface, assetID string, materialType string, materialBatchID string, supplierID string, fullDataPayload string) error {
    	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
    	if err != nil {
    		return fmt.Errorf("failed to get client MSPID: %v", err)
    	}
    	// Use a different assetID to avoid conflict with the lightweight test
    	naiveAssetID := "NAIVE_" + assetID
    	exists, err := s.AssetExists(ctx, naiveAssetID)
    	if err != nil {
    		return err
    	}
    	if exists {
    		return fmt.Errorf("the asset %s already exists", naiveAssetID)
    	}
    	event := ProvenanceEvent{
    		EventType:         "MATERIAL_CERTIFICATION_NAIVE",
    		AgentID:           clientMSPID,
    		OnChainDataPayload: fullDataPayload, // Storing the large payload
    		MaterialType:      materialType,
    		MaterialBatchID:   materialBatchID,
    		SupplierID:        supplierID,
    	}
    	txID, err := s.recordEvent(ctx, event)
    	if err != nil {
    		return err
    	}
    	asset := Asset{
    		AssetID:             naiveAssetID,
    		Owner:               clientMSPID,
    		CurrentLifecycleStage: "MATERIAL_CERTIFIED_NAIVE",
    		HistoryTxIDs:        []string{txID},
    	}
    	assetJSON, err := json.Marshal(asset)
    	if err != nil {
    		return err
    	}
    	return ctx.GetStub().PutState(naiveAssetID, assetJSON)
    }

    // #######################################################################################
    // #                         (Other functions remain the same)                           #
    // #######################################################################################

    // CreatePrintJobStart records the commencement of a print job.
    func (s *SmartContract) CreatePrintJobStart(ctx contractapi.TransactionContextInterface, assetID string, machineID string, materialBatchUsedID string, designFileHash string, buildJobID string, offChainDataHash string) error {
    	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
    	if err != nil {
    		return fmt.Errorf("failed to get client MSPID: %v", err)
    	}
    	exists, err := s.AssetExists(ctx, assetID)
    	if err != nil {
    		return err
    	}
    	if exists {
    		return fmt.Errorf("the asset %s already exists", assetID)
    	}
    	event := ProvenanceEvent{
    		EventType:           "PRINT_JOB_START",
    		AgentID:             clientMSPID,
    		OffChainDataHash:      offChainDataHash,
    		MachineID:           machineID,
    		MaterialBatchUsedID: materialBatchUsedID,
    		DesignFileHash:      designFileHash,
    		BuildJobID:          buildJobID,
    	}
    	txID, err := s.recordEvent(ctx, event)
    	if err != nil {
    		return err
    	}
    	asset := Asset{
    		AssetID:             assetID,
    		Owner:               clientMSPID,
    		CurrentLifecycleStage: "IN_PRODUCTION",
    		HistoryTxIDs:        []string{txID},
    	}
    	assetJSON, err := json.Marshal(asset)
    	if err != nil {
    		return err
    	}
    	return ctx.GetStub().PutState(assetID, assetJSON)
    }

    // CreatePrintJobCompletion updates an existing asset after printing is complete.
    func (s *SmartContract) CreatePrintJobCompletion(ctx contractapi.TransactionContextInterface, assetID string, buildJobID string, inspectionResult string, offChainDataHash string) error {
    	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
    	if err != nil {
    		return fmt.Errorf("failed to get client MSPID: %v", err)
    	}
    	asset, err := s.ReadAsset(ctx, assetID)
    	if err != nil {
    		return err
    	}
    	event := ProvenanceEvent{
    		EventType:               "PRINT_JOB_COMPLETION",
    		AgentID:                 clientMSPID,
    		OffChainDataHash:          offChainDataHash,
    		BuildJobID:              buildJobID,
    		PrimaryInspectionResult: inspectionResult,
    	}
    	txID, err := s.recordEvent(ctx, event)
    	if err != nil {
    		return err
    	}
    	asset.CurrentLifecycleStage = "AWAITING_QA"
    	asset.HistoryTxIDs = append(asset.HistoryTxIDs, txID)
    	assetJSON, err := json.Marshal(asset)
    	if err != nil {
    		return err
    	}
    	return ctx.GetStub().PutState(assetID, assetJSON)
    }

    // CreateQACertify updates an existing asset with quality assurance results.
    func (s *SmartContract) CreateQACertify(ctx contractapi.TransactionContextInterface, assetID string, testStandard string, testResult string, certificateID string, offChainDataHash string) error {
    	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
    	if err != nil {
    		return fmt.Errorf("failed to get client MSPID: %v", err)
    	}
    	asset, err := s.ReadAsset(ctx, assetID)
    	if err != nil {
    		return err
    	}
    	event := ProvenanceEvent{
    		EventType:           "QA_CERTIFY",
    		AgentID:             clientMSPID,
    		OffChainDataHash:      offChainDataHash,
    		TestStandardApplied: testStandard,
    		FinalTestResult:     testResult,
    		CertificateID:       certificateID,
    	}
    	txID, err := s.recordEvent(ctx, event)
    	if err != nil {
    		return err
    	}
    	if testResult == "CERTIFIED_FIT_FOR_USE" {
    		asset.CurrentLifecycleStage = "CERTIFIED"
    	} else {
    		asset.CurrentLifecycleStage = "REJECTED"
    	}
    	asset.HistoryTxIDs = append(asset.HistoryTxIDs, txID)
    	assetJSON, err := json.Marshal(asset)
    	if err != nil {
    		return err
    	}
    	return ctx.GetStub().PutState(assetID, assetJSON)
    }

    // ReadAsset returns the asset stored in the world state with the given id.
    func (s *SmartContract) ReadAsset(ctx contractapi.TransactionContextInterface, assetID string) (*Asset, error) {
    	assetJSON, err := ctx.GetStub().GetState(assetID)
    	if err != nil {
    		return nil, fmt.Errorf("failed to read from world state: %v", err)
    	}
    	if assetJSON == nil {
    		return nil, fmt.Errorf("the asset %s does not exist", assetID)
    	}
    	var asset Asset
    	err = json.Unmarshal(assetJSON, &asset)
    	if err != nil {
    		return nil, err
    	}
    	return &asset, nil
    }

    // GetAssetHistory returns the full provenance history of an asset.
    func (s *SmartContract) GetAssetHistory(ctx contractapi.TransactionContextInterface, assetID string) ([]*ProvenanceEvent, error) {
    	asset, err := s.ReadAsset(ctx, assetID)
    	if err != nil {
    		return nil, err
    	}
    	var history []*ProvenanceEvent
    	for _, txID := range asset.HistoryTxIDs {
    		eventKey := "EVENT_" + txID
    		eventJSON, err := ctx.GetStub().GetState(eventKey)
    		if err != nil {
    			fmt.Printf("Warning: could not retrieve event for txID %s: %v\n", txID, err)
    			continue
    		}
    		if eventJSON == nil {
    			fmt.Printf("Warning: no event found for txID %s\n", txID)
    			continue
    		}
    		var event ProvenanceEvent
    		err = json.Unmarshal(eventJSON, &event)
    		if err != nil {
    			fmt.Printf("Warning: could not unmarshal event for txID %s: %v\n", txID, err)
    			continue
    		}
    		history = append(history, &event)
    	}
    	return history, nil
    }

    // AssetExists returns true when asset with given ID exists in world state
    func (s *SmartContract) AssetExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {
    	assetJSON, err := ctx.GetStub().GetState(id)
    	if err != nil {
    		return false, fmt.Errorf("failed to read from world state: %v", err)
    	}
    	return assetJSON != nil, nil
    }

    func main() {
    	chaincode, err := contractapi.NewChaincode(&SmartContract{})
    	if err != nil {
    		fmt.Printf("Error creating AM provenance chaincode: %v", err)
    		return
    	}
    	if err := chaincode.Start(); err != nil {
    		fmt.Printf("Error starting AM provenance chaincode: %v", err)
    	}
    }


## 5.1

creationg 1 MB file and getting argument too long

#!/bin/bash

echo "--- Preparing for Naive Model Performance Test (1MB Payload) ---"

# Step 1: Create a 1 megabyte dummy data file
echo "Creating a 1MB dummy data file named 'large_payload.bin'..."
dd if=/dev/urandom of=large_payload.bin bs=1M count=1
echo "Dummy file created."

# Step 2: Base64 encode the file content
echo "Base64 encoding the payload..."
PAYLOAD=$(base64 -w 0 large_payload.bin)
echo "Payload encoded."

# Step 3: Set environment variables (same as before)
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

# Step 4: Invoke the Naive function and measure the time
echo "--- Invoking CreateMaterialCertification_Naive with 1MB payload. This may take a moment... ---"

time peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" -C mychannel -n amprovenance --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" -c '{"function":"CreateMaterialCertification_Naive","Args":["MATERIAL_BATCH_NAIVE_003", "SS316L", "POWDER-NAIVE-3", "SupplierCorpMSP", "'"$PAYLOAD"'"]}'

# Step 5: Clean up the dummy file
rm large_payload.bin
echo "--- Test complete. ---"




5.2 node.js test file

'use strict';

const { connect, Contract, Identity, Signer, signers } = require('@hyperledger/fabric-gateway');
const grpc = require('@grpc/grpc-js'); // Added grpc import
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// --- Configuration ---
const channelName = 'mychannel';
const chaincodeName = 'amprovenance';
const mspId = 'Org1MSP';

// Path to crypto materials.
const cryptoPath = path.resolve(__dirname, '..', 'fabric', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com');
// Path to user private key directory.
const keyDirectoryPath = path.resolve(cryptoPath, 'users', 'Admin@org1.example.com', 'msp', 'keystore');
// Path to user certificate.
const certPath = path.resolve(cryptoPath, 'users', 'Admin@org1.example.com', 'msp', 'signcerts', 'cert.pem');
// Path to peer tls certificate.
const tlsCertPath = path.resolve(cryptoPath, 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt');
// Gateway peer endpoint.
const peerEndpoint = 'localhost:7051';
// Gateway peer SSL host name override.
const peerHostAlias = 'peer0.org1.example.com';

async function main() {
    console.log('--- Starting Performance Test ---');

    // The gRPC client connection should be shared by all Gateway connections to this endpoint.
    const client = await newGrpcConnection();
    const gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        evaluateOptions: () => ({ deadline: Date.now() + 5000 }), // 5 seconds
        endorseOptions: () => ({ deadline: Date.now() + 15000 }), // 15 seconds
        submitOptions: () => ({ deadline: Date.now() + 120000 }), // Increased to 120 seconds for large payloads
        commitStatusOptions: () => ({ deadline: Date.now() + 120000 }), // Increased to 120 seconds
    });

    try {
        const contract = gateway.getNetwork(channelName).getContract(chaincodeName);

        // === Test 1: Lightweight Model ===
        await testLightweight(contract);

        // === Test 2: Naive Model with 1MB Payload ===
        await testNaive(contract, 1 * 1024 * 1024); // 1 MB

    } finally {
        gateway.close();
        client.close();
    }
}

async function testLightweight(contract) {
    console.log('\n--- Testing Lightweight Model ---');
    const assetId = `MATERIAL_BATCH_${Date.now()}`;
    const offChainHash = crypto.createHash('sha256').update('small payload').digest('hex');

    try {
        const startTime = process.hrtime.bigint();
        await contract.submitTransaction(
            'CreateMaterialCertification',
            assetId,
            'Ti6Al4V',
            'POWDER-SDK-123',
            'SupplierCorpMSP',
            offChainHash
        );
        const endTime = process.hrtime.bigint();
        const latencyMs = (endTime - startTime) / 1000000n;
        console.log(`*** SUCCESS: Lightweight transaction committed.`);
        console.log(`*** KPI: Transaction Latency = ${latencyMs} ms`);
    } catch (error) {
        console.error('*** FAILED: Lightweight transaction failed:', error);
    }
}

async function testNaive(contract, payloadSize) {
    console.log(`\n--- Testing Naive Model with ${payloadSize / (1024*1024)}MB Payload ---`);
    const assetId = `NAIVE_BATCH_${Date.now()}`;
    
    // Create a large dummy payload
    const payload = crypto.randomBytes(payloadSize).toString('base64');
    console.log(`Payload created. Size: ${Buffer.byteLength(payload, 'utf8')} bytes.`);

    try {
        const startTime = process.hrtime.bigint();
        console.log('Submitting naive transaction... This will take some time.');
        await contract.submitTransaction(
            'CreateMaterialCertification_Naive',
            assetId,
            'SS316L',
            'POWDER-SDK-NAIVE',
            'SupplierCorpMSP',
            payload
        );
        const endTime = process.hrtime.bigint();
        const latencyMs = (endTime - startTime) / 1000000n;
        console.log(`*** SUCCESS: Naive transaction committed.`);
        console.log(`*** KPI: Transaction Latency = ${latencyMs} ms`);

    } catch (error) {
        console.error('*** FAILED: Naive transaction failed:', error);
    }
}


// --- Helper Functions for Connection ---

// newGrpcConnection creates a gRPC connection to a Hyperledger Fabric peer.
async function newGrpcConnection() {
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
    });
}

async function newIdentity() {
    const cert = await fs.readFile(certPath);
    return { mspId, credentials: cert };
}

async function newSigner() {
    const files = await fs.readdir(keyDirectoryPath);
    const keyPath = path.resolve(keyDirectoryPath, files[0]);
    const privateKeyPem = await fs.readFile(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    return signers.newPrivateKeySigner(privateKey);
}

main().catch(error => {
    console.error('******** FAILED to run the application', error);
    process.exitCode = 1;
});

