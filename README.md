# DIAM3.3 Provenance
# Lightweight Provenance for Additive Manufacturing using Hyperledger Fabric


This repository contains the source code and instructions for a blockchain-based proof-of-concept designed to provide a lightweight, efficient, and auditable provenance trail for components produced via Additive Manufacturing (AM).

The core of this project is a Hyperledger Fabric smart contract (chaincode) that implements a hybrid data model. Essential, verifiable data for each lifecycle event is stored on-chain, while a cryptographic hash links to voluminous off-chain data (e.g., machine logs, CAD files, QA reports), thus ensuring scalability and cost-effectiveness.


the audio file from NoteBookLM to explain the project
https://notebooklm.google.com/notebook/cf67fb48-03c9-4ed7-a241-1c2ce2132fb0/audio


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
```



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
```
https://g.co/gemini/share/f9a73166be43
```


the lightwight smart contarct
```python
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
```

### Step 5: the naive model
the cobined model smart contract
```go
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

```
## 5.1

creationg 1 MB file and getting argument too long
```bash
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

```









5.2 node.js test file
```python
'use strict';

const { connect, Contract, Identity, Signer, signers } = require('@hyperledger/fabric-gateway');
const grpc = require('@grpc/grpc-js');
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
const testRuns = 3; // Number of times to run each test for averaging

async function main() {
    console.log('--- Starting Final Performance & Stress Test ---');

    const client = await newGrpcConnection();
    const gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
        endorseOptions: () => ({ deadline: Date.now() + 15000 }),
        submitOptions: () => ({ deadline: Date.now() + 120000 }),
        commitStatusOptions: () => ({ deadline: Date.now() + 120000 }),
    });

    try {
        const contract = gateway.getNetwork(channelName).getContract(chaincodeName);

        // --- Warm-up Run ---
        console.log('--- Performing warm-up transaction... ---');
        await testLightweight(contract, true);

        // === Lightweight Model Test ===
        const lightweightLatencies = [];
        console.log(`\n--- Testing Lightweight Model (${testRuns} runs) ---`);
        for (let i = 0; i < testRuns; i++) {
            const latency = await testLightweight(contract);
            lightweightLatencies.push(latency);
            await sleep(1000); 
        }
        const lightweightAvg = lightweightLatencies.reduce((a, b) => a + b, 0) / lightweightLatencies.length;

        // === Naive Model (1MB) Test ===
        const naive1MB_Latencies = [];
        console.log(`\n--- Testing Naive Model with 1MB Payload (${testRuns} runs) ---`);
        for (let i = 0; i < testRuns; i++) {
            const latency = await testNaive(contract, 1 * 1024 * 1024);
            naive1MB_Latencies.push(latency);
            await sleep(1000);
        }
        const naive1MB_Avg = naive1MB_Latencies.reduce((a, b) => a + b, 0) / naive1MB_Latencies.length;
        
        // === Naive Model (2MB) Stress Test ===
        console.log(`\n--- Stress Testing Naive Model with 2MB Payload ---`);
        await testNaive(contract, 2 * 1024 * 1024);

        // === Naive Model (5MB) Stress Test ===
        console.log(`\n--- Stress Testing Naive Model with 5MB Payload ---`);
        await testNaive(contract, 5 * 1024 * 1024);


        // --- Final Results Summary ---
        console.log(`\n\n==================== FINAL RESULTS ====================`);
        console.log(`*** Lightweight Model Avg. Latency:      ${lightweightAvg.toFixed(2)} ms`);
        console.log(`*** Naive Model (1MB) Avg. Latency:      ${naive1MB_Avg.toFixed(2)} ms`);
        console.log(`--- Performance Gap (1MB): Naive model is approximately ${(naive1MB_Avg / lightweightAvg).toFixed(1)}x slower.`);
        console.log(`=======================================================`);

    } finally {
        gateway.close();
        client.close();
    }
}

async function testLightweight(contract, isWarmup = false) {
    const assetId = `MATERIAL_BATCH_${Date.now()}`;
    const offChainHash = crypto.createHash('sha256').update('small payload').digest('hex');
    const startTime = process.hrtime.bigint();
    try {
        await contract.submitTransaction(
            'CreateMaterialCertification',
            assetId,
            'Ti6Al4V',
            'POWDER-SDK-123',
            'SupplierCorpMSP',
            offChainHash
        );
        const endTime = process.hrtime.bigint();
        const latencyMs = Number((endTime - startTime) / 1000000n);
        if (!isWarmup) {
            console.log(`Run complete. Latency: ${latencyMs} ms`);
            return latencyMs;
        } else {
            console.log('Warm-up complete.');
            return 0; // Don't return a value for warmup
        }
    } catch (error) {
        console.error('Lightweight test failed:', error);
        return -1; // Indicate failure
    }
}

async function testNaive(contract, payloadSize) {
    const assetId = `NAIVE_BATCH_${Date.now()}`;
    // Create a large dummy payload
    const payload = crypto.randomBytes(payloadSize).toString('base64');
    const payloadMB = (payloadSize / (1024 * 1024)).toFixed(1);

    console.log(`Submitting naive transaction with ${payloadMB}MB payload...`);
    
    const startTime = process.hrtime.bigint();
    try {
        await contract.submitTransaction(
            'CreateMaterialCertification_Naive',
            assetId,
            'SS316L',
            'POWDER-SDK-NAIVE',
            'SupplierCorpMSP',
            payload
        );
        const endTime = process.hrtime.bigint();
        const latencyMs = Number((endTime - startTime) / 1000000n);
        console.log(`*** SUCCESS: Naive transaction (${payloadMB}MB) committed. Latency: ${latencyMs} ms`);
        return latencyMs;
    } catch(error) {
        console.error(`*** FAILED: Naive transaction (${payloadMB}MB) failed. Error message:`);
        console.error(error.message); // Print just the concise error message
        return -1; // Indicate failure
    }
}

// --- Helper Functions ---
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function newGrpcConnection() {
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
        'grpc.max_send_message_length': -1, // Allow sending large messages
        'grpc.max_receive_message_length': -1, // Allow receiving large messages
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


```


results on a chart :

```python
import matplotlib.pyplot as plt
import numpy as np

# --- Data from our final tests ---
# Labels for the x-axis, ordered logically
labels = [
    'Lightweight\n(~270 Bytes)',
    'Naive\n(10 KB)',
    'Naive\n(20 KB)',
    'Naive\n(50 KB)',
    'Naive\n(150 KB)',
    'Naive\n(2 MB)',
    'Naive\n(5 MB)'
]

# Corresponding latency values in milliseconds
latencies = [47, 128, 108, 160, 148, 531, 1012]

# --- Chart Creation ---
# Define colors: one for our model, and a gradient for the naive model
colors = ['#007acc'] + plt.cm.Oranges(np.linspace(0.3, 0.8, len(latencies) - 1)).tolist()

# Create the figure and axis objects
fig, ax = plt.subplots(figsize=(10, 6))

# Create the bar chart
bars = ax.bar(labels, latencies, color=colors, width=0.6)

# --- Styling and Labels ---
# Add a title and clear axis labels
ax.set_title('Transaction Latency Comparison: Lightweight vs. Naive Model', fontsize=16, pad=20)
ax.set_ylabel('Average Latency (ms)', fontsize=12)
ax.set_xlabel('Model and On-Chain Payload Size', fontsize=12)

# Set the y-axis to start from 0 and add a little padding at the top
ax.set_ylim(0, max(latencies) * 1.1)

# Remove the top and right spines for a cleaner look
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)

# Add a light grid for better readability
ax.yaxis.grid(True, linestyle='--', which='major', color='grey', alpha=.25)

# Add data labels on top of each bar
for bar in bars:
    yval = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2.0, yval, f'{int(yval)} ms', va='bottom', ha='center', fontsize=10) # va: vertical alignment

# Improve layout to prevent labels from overlapping
plt.xticks(rotation=15) # Rotate x-axis labels slightly
plt.tight_layout()

# Save the figure to a file
# The high DPI (dots per inch) makes it suitable for publication
plt.savefig('latency_chart.png', dpi=300)

# Display the plot
plt.show()

main().catch(error => {
    console.error('******** FAILED to run the application', error);
    process.exitCode = 1;
});

```
![image](https://github.com/user-attachments/assets/cebe680b-7bf6-4fec-a4cb-af3a3183e38f)

The test app code for the Latency testing

```python
'use strict';



const { connect, Contract, Identity, Signer, signers } = require('@hyperledger/fabric-gateway');

const grpc = require('@grpc/grpc-js');

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



// Payload sizes from the data footprint table

const naivePayloads = [

    { event: 'Material Certification', size: 50 * 1024 },    // 50KB

    { event: 'Design Finalization', size: 2 * 1024 * 1024 }, // 2MB

    { event: 'Print Job Start', size: 10 * 1024 },     // 10KB

    { event: 'Print Job Completion', size: 5 * 1024 * 1024 }, // 5MB

    { event: 'Post-Processing', size: 20 * 1024 },     // 20KB

    { event: 'QA & Certification', size: 150 * 1024 }   // 150KB

];



async function main() {

    console.log('--- Starting Comprehensive Lifecycle Performance Test ---');



    const client = await newGrpcConnection();

    const gateway = connect({

        client,

        identity: await newIdentity(),

        signer: await newSigner(),

        evaluateOptions: () => ({ deadline: Date.now() + 5000 }),

        endorseOptions: () => ({ deadline: Date.now() + 15000 }),

        submitOptions: () => ({ deadline: Date.now() + 120000 }),

        commitStatusOptions: () => ({ deadline: Date.now() + 120000 }),

    });



    const results = [];



    try {

        const contract = gateway.getNetwork(channelName).getContract(chaincodeName);



        // --- Warm-up Run ---

        console.log('--- Performing warm-up transaction... ---');

        await testLightweight(contract, true);



        // === Lightweight Model Baseline ===

        console.log(`\n--- Testing Lightweight Model ---`);

        const lightweightLatency = await testLightweight(contract);

        results.push({

            'Test Case': 'Lightweight Model (Baseline)',

            'Payload Size': '~270 Bytes',

            'Latency (ms)': lightweightLatency.toFixed(2),

            'Performance Factor': '1.0x'

        });

        await sleep(1000);



        // === Naive Model Lifecycle Tests ===

        for (const payloadInfo of naivePayloads) {

            console.log(`\n--- Testing Naive Model: ${payloadInfo.event} ---`);

            const naiveLatency = await testNaive(contract, payloadInfo.size, payloadInfo.event);

            results.push({

                'Test Case': `Naive Model: ${payloadInfo.event}`,

                'Payload Size': `${(payloadInfo.size / 1024).toFixed(0)} KB`,

                'Latency (ms)': naiveLatency > 0 ? naiveLatency.toFixed(2) : 'FAILED',

                'Performance Factor': naiveLatency > 0 ? `~${(naiveLatency / lightweightLatency).toFixed(1)}x` : 'N/A'

            });

            await sleep(1000);

        }



    } finally {

        gateway.close();

        client.close();

        printResultsTable(results);

    }

}



async function testLightweight(contract, isWarmup = false) {

    const assetId = `MATERIAL_BATCH_${Date.now()}`;

    const offChainHash = crypto.createHash('sha256').update('small payload').digest('hex');

    const startTime = process.hrtime.bigint();

    try {

        await contract.submitTransaction(

            'CreateMaterialCertification',

            assetId,

            'Ti6Al4V',

            'POWDER-SDK-123',

            'SupplierCorpMSP',

            offChainHash

        );

        const endTime = process.hrtime.bigint();

        const latencyMs = Number((endTime - startTime) / 1000000n);

        if (!isWarmup) {

            console.log(`Run complete. Latency: ${latencyMs} ms`);

            return latencyMs;

        } else {

            console.log('Warm-up complete.');

            return 0; // Don't return a value for warmup

        }

    } catch (error) {

        if (!isWarmup) console.error('Lightweight test failed:', error);

        return -1; // Indicate failure

    }

}



async function testNaive(contract, payloadSize, eventName) {

    const assetId = `NAIVE_BATCH_${eventName.replace(/\s+/g, '')}_${Date.now()}`;

    const payload = crypto.randomBytes(payloadSize).toString('base64');

    const payloadKB = (payloadSize / 1024).toFixed(0);



    console.log(`Submitting naive transaction with ${payloadKB}KB payload...`);

    

    const startTime = process.hrtime.bigint();

    try {

        await contract.submitTransaction(

            'CreateMaterialCertification_Naive',

            assetId,

            'SS316L',

            'POWDER-SDK-NAIVE',

            'SupplierCorpMSP',

            payload

        );

        const endTime = process.hrtime.bigint();

        const latencyMs = Number((endTime - startTime) / 1000000n);

        console.log(`*** SUCCESS: Naive transaction (${payloadKB}KB) committed. Latency: ${latencyMs} ms`);

        return latencyMs;

    } catch(error) {

        console.error(`*** FAILED: Naive transaction (${payloadKB}KB) failed. Error message:`);

        // We only print the error message to keep the log clean

        console.error(error.message.split('\n')[0]);

        return -1; // Indicate failure

    }

}



function printResultsTable(results) {

    console.log('\n\n==================== FINAL COMPREHENSIVE RESULTS ====================');

    console.table(results);

    console.log('=====================================================================');

}



// --- Helper Functions ---

function sleep(ms) {

    return new Promise(resolve => setTimeout(resolve, ms));

}



async function newGrpcConnection() {

    const tlsRootCert = await fs.readFile(tlsCertPath);

    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);

    return new grpc.Client(peerEndpoint, tlsCredentials, {

        'grpc.ssl_target_name_override': peerHostAlias,

        'grpc.max_send_message_length': -1, // Allow sending large messages

        'grpc.max_receive_message_length': -1, // Allow receiving large messages

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



// --- Main execution ---

main().catch(error => {

    console.error('******** FAILED to run the application', error);

    process.exitCode = 1;

});
```
<!--

the test app version to measure the throughput 

```python

'use strict';

const { connect, Contract, Identity, Signer, signers } = require('@hyperledger/fabric-gateway');
const grpc = require('@grpc/grpc-js');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// --- Configuration ---
const channelName = 'mychannel';
const chaincodeName = 'amprovenance';
const mspId = 'Org1MSP';

// --- Test Parameters ---
const throughputTestCount = 100; // Number of transactions to send for TPS test
const naiveThroughputPayloadSize = 10 * 1024; // 10KB for naive model TPS test

// --- Connection Details ---
const cryptoPath = path.resolve(__dirname, '..', 'fabric', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com');
const keyDirectoryPath = path.resolve(cryptoPath, 'users', 'Admin@org1.example.com', 'msp', 'keystore');
const certPath = path.resolve(cryptoPath, 'users', 'Admin@org1.example.com', 'msp', 'signcerts', 'cert.pem');
const tlsCertPath = path.resolve(cryptoPath, 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt');
const peerEndpoint = 'localhost:7051';
const peerHostAlias = 'peer0.org1.example.com';

async function main() {
    console.log('--- Starting Comprehensive Performance & Throughput Test ---');

    const client = await newGrpcConnection();
    const gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
        endorseOptions: () => ({ deadline: Date.now() + 15000 }),
        submitOptions: () => ({ deadline: Date.now() + 120000 }),
        commitStatusOptions: () => ({ deadline: Date.now() + 120000 }),
    });

    const latencyResults = [];
    const throughputResults = {};

    try {
        const contract = gateway.getNetwork(channelName).getContract(chaincodeName);

        // --- Warm-up Run ---
        console.log('--- Performing warm-up transaction... ---');
        await testLightweightLatency(contract, true);

        // === Lightweight Model Latency ===
        console.log(`\n--- Testing Lightweight Model Latency ---`);
        const lightweightLatency = await testLightweightLatency(contract);
        latencyResults.push({
            'Test Case': 'Lightweight Model (Latency)',
            'Payload Size': '~270 Bytes',
            'Latency (ms)': lightweightLatency.toFixed(2),
        });
        await sleep(1000);

        // === Naive Model Latency ===
        console.log(`\n--- Testing Naive Model Latency (1MB) ---`);
        const naiveLatency = await testNaiveLatency(contract, 1 * 1024 * 1024);
        latencyResults.push({
            'Test Case': 'Naive Model (Latency)',
            'Payload Size': '1 MB',
            'Latency (ms)': naiveLatency > 0 ? naiveLatency.toFixed(2) : 'FAILED',
        });
        await sleep(1000);

        // === Throughput Tests ===
        console.log(`\n--- Testing Lightweight Model Throughput (${throughputTestCount} TXs) ---`);
        throughputResults.lightweightTPS = await testThroughput(contract, 'lightweight');

        console.log(`\n--- Testing Naive Model Throughput (${throughputTestCount} TXs) ---`);
        throughputResults.naiveTPS = await testThroughput(contract, 'naive', naiveThroughputPayloadSize);

    } finally {
        gateway.close();
        client.close();
        printFinalResults(latencyResults, throughputResults);
    }
}

// --- Test Functions ---

async function testLightweightLatency(contract, isWarmup = false) {
    const assetId = `LATENCY_BATCH_${Date.now()}`;
    const offChainHash = crypto.createHash('sha256').update('small payload').digest('hex');
    const startTime = process.hrtime.bigint();
    try {
        await contract.submitTransaction('CreateMaterialCertification', assetId, 'Ti6Al4V', 'POWDER-SDK-LATENCY', 'SupplierCorpMSP', offChainHash);
        const endTime = process.hrtime.bigint();
        const latencyMs = Number((endTime - startTime) / 1000000n);
        if (isWarmup) { console.log('Warm-up complete.'); return 0; }
        console.log(`Run complete. Latency: ${latencyMs} ms`);
        return latencyMs;
    } catch (error) {
        if (!isWarmup) console.error('Lightweight latency test failed:', error);
        return -1;
    }
}

async function testNaiveLatency(contract, payloadSize) {
    const assetId = `LATENCY_NAIVE_${Date.now()}`;
    const payload = crypto.randomBytes(payloadSize).toString('base64');
    console.log(`Submitting naive transaction with ${payloadSize / (1024 * 1024)}MB payload...`);
    const startTime = process.hrtime.bigint();
    try {
        await contract.submitTransaction('CreateMaterialCertification_Naive', assetId, 'SS316L', 'POWDER-SDK-NAIVE-LATENCY', 'SupplierCorpMSP', payload);
        const endTime = process.hrtime.bigint();
        const latencyMs = Number((endTime - startTime) / 1000000n);
        console.log(`*** SUCCESS: Naive latency transaction committed. Latency: ${latencyMs} ms`);
        return latencyMs;
    } catch (error) {
        console.error(`*** FAILED: Naive latency transaction failed. Error:`, error.message.split('\n')[0]);
        return -1;
    }
}

async function testThroughput(contract, modelType, payloadSize = 0) {
    const promises = [];
    console.log(`Submitting ${throughputTestCount} concurrent transactions...`);
    const startTime = process.hrtime.bigint();

    for (let i = 0; i < throughputTestCount; i++) {
        const assetId = `TPS_${modelType.toUpperCase()}_${Date.now()}_${i}`;
        let txPromise;

        if (modelType === 'lightweight') {
            const offChainHash = crypto.createHash('sha256').update(`tps_payload_${i}`).digest('hex');
            txPromise = contract.submitTransaction('CreateMaterialCertification', assetId, 'TPS-Mat', `TPS-Batch-${i}`, 'TPS-Supplier', offChainHash);
        } else { // naive model
            const payload = crypto.randomBytes(payloadSize).toString('base64');
            txPromise = contract.submitTransaction('CreateMaterialCertification_Naive', assetId, 'TPS-Mat-Naive', `TPS-Batch-Naive-${i}`, 'TPS-Supplier-Naive', payload);
        }
        promises.push(txPromise);
    }

    try {
        await Promise.all(promises);
        const endTime = process.hrtime.bigint();
        const totalTimeMs = Number((endTime - startTime) / 1000000n);
        const totalTimeSec = totalTimeMs / 1000;
        const tps = throughputTestCount / totalTimeSec;
        
        console.log(`*** SUCCESS: All ${throughputTestCount} transactions committed.`);
        console.log(`Total time: ${totalTimeSec.toFixed(2)} seconds.`);
        console.log(`Throughput: ${tps.toFixed(2)} TPS`);
        return tps;
    } catch (error) {
        console.error(`*** FAILED: Throughput test failed for ${modelType} model. Error:`, error.message.split('\n')[0]);
        return 0;
    }
}

// --- Helper & Printing Functions ---

function printFinalResults(latencyResults, throughputResults) {
    console.log('\n\n==================== FINAL PERFORMANCE & THROUGHPUT RESULTS ====================');
    console.log('\n--- Latency Results (Single Transaction) ---');
    console.table(latencyResults);
    
    console.log('\n--- Throughput Results (Sustained Load) ---');
    const tpsData = [
        { Model: 'Lightweight Model', 'Payload per TX': '~270 Bytes', 'Throughput (TPS)': throughputResults.lightweightTPS.toFixed(2) },
        { Model: 'Naive Model', 'Payload per TX': `${(naiveThroughputPayloadSize / 1024).toFixed(0)} KB`, 'Throughput (TPS)': throughputResults.naiveTPS.toFixed(2) }
    ];
    console.table(tpsData);
    console.log('================================================================================');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function newGrpcConnection() {
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
        'grpc.max_send_message_length': -1,
        'grpc.max_receive_message_length': -1,
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
```
the results with 10k sixe for the naive model

![Screenshot from 2025-06-19 01-11-28](https://github.com/user-attachments/assets/6711ac1c-75c9-4345-b68c-1572121a0c37)

The result with 50k file size for the naive model

%![image](https://github.com/user-attachments/assets/5eefd20c-3ad6-4c25-a326-9b0ffb23ac68)

-->

***The test app code for the throghput for the lightwight model vs the naive model with file sizes of 10KB, 50KB, 150KB, 1MB.  the test was to send 100 transactions to the network and measure the end-to-end total time and calculating the TPS
```python
'use strict';

const { connect, Contract, Identity, Signer, signers } = require('@hyperledger/fabric-gateway');
const grpc = require('@grpc/grpc-js');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// --- Configuration ---
const channelName = 'mychannel';
const chaincodeName = 'amprovenance';
const mspId = 'Org1MSP';

// --- Test Parameters ---
const throughputTestCount = 100; // Total transactions for each TPS test
const concurrency = 10; // How many transactions to send in parallel at a time

// --- Connection Details ---
const cryptoPath = path.resolve(__dirname, '..', 'fabric', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com');
const keyDirectoryPath = path.resolve(cryptoPath, 'users', 'Admin@org1.example.com', 'msp', 'keystore');
const certPath = path.resolve(cryptoPath, 'users', 'Admin@org1.example.com', 'msp', 'signcerts', 'cert.pem');
const tlsCertPath = path.resolve(cryptoPath, 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt');
const peerEndpoint = 'localhost:7051';
const peerHostAlias = 'peer0.org1.example.com';

// Payloads for throughput tests
const throughputPayloads = [
    { name: 'Lightweight', size: 0 }, // Size 0 indicates lightweight model
    { name: 'Naive (10KB)', size: 10 * 1024 },
    { name: 'Naive (50KB)', size: 50 * 1024 },
    { name: 'Naive (150KB)', size: 150 * 1024 },
    { name: 'Naive (1MB)', size: 1 * 1024 * 1024 }
];


async function main() {
    console.log('--- Starting Final Comprehensive Performance & Throughput Test ---');

    const client = await newGrpcConnection();
    const gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
        endorseOptions: () => ({ deadline: Date.now() + 15000 }),
        submitOptions: () => ({ deadline: Date.now() + 300000 }), // Increased timeout for heavy tests
        commitStatusOptions: () => ({ deadline: Date.now() + 300000 }),
    });

    const results = [];

    try {
        const contract = gateway.getNetwork(channelName).getContract(chaincodeName);

        // --- Warm-up Run ---
        console.log('--- Performing warm-up transaction... ---');
        await testLightweightLatency(contract, true);
        await sleep(1000);

        // === Run all throughput tests ===
        for (const test of throughputPayloads) {
            console.log(`\n--- Testing Throughput: ${test.name} ---`);
            const tps = await testThroughput(contract, test.size);
            results.push({
                'Test Case': test.name,
                'Payload per TX': test.size === 0 ? '~270 Bytes' : `${(test.size / 1024)} KB`,
                'Throughput (TPS)': tps.toFixed(2),
            });
            await sleep(2000); // Pause between tests
        }

    } finally {
        gateway.close();
        client.close();
        printFinalResults(results);
    }
}

// --- Test Functions ---

async function testLightweightLatency(contract, isWarmup = false) {
    const assetId = `LATENCY_BATCH_${Date.now()}`;
    const offChainHash = crypto.createHash('sha256').update('small payload').digest('hex');
    try {
        await contract.submitTransaction('CreateMaterialCertification', assetId, 'Ti6Al4V', 'POWDER-SDK-LATENCY', 'SupplierCorpMSP', offChainHash);
        if (isWarmup) console.log('Warm-up complete.');
    } catch (error) {
        if (!isWarmup) console.error('Lightweight latency test failed:', error);
    }
}

async function testThroughput(contract, payloadSize = 0) {
    const transactions = [];
    for (let i = 0; i < throughputTestCount; i++) {
        const assetId = `TPS_${payloadSize}_${Date.now()}_${i}`;
        if (payloadSize === 0) { // Lightweight model
            const offChainHash = crypto.createHash('sha256').update(`tps_payload_${i}`).digest('hex');
            transactions.push({
                func: 'CreateMaterialCertification',
                args: [assetId, 'TPS-Mat', `TPS-Batch-${i}`, 'TPS-Supplier', offChainHash]
            });
        } else { // Naive model
            const payload = crypto.randomBytes(payloadSize).toString('base64');
            transactions.push({
                func: 'CreateMaterialCertification_Naive',
                args: [assetId, 'TPS-Mat-Naive', `TPS-Batch-Naive-${i}`, 'TPS-Supplier-Naive', payload]
            });
        }
    }

    const payloadKB = (payloadSize / 1024).toFixed(0);
    console.log(`Submitting ${throughputTestCount} transactions in chunks of ${concurrency}, with ${payloadKB}KB payload each...`);
    const startTime = process.hrtime.bigint();
    
    try {
        for (let i = 0; i < transactions.length; i += concurrency) {
            const chunk = transactions.slice(i, i + concurrency);
            const promises = chunk.map(tx => contract.submitTransaction(tx.func, ...tx.args));
            await Promise.all(promises);
            console.log(`Batch ${i/concurrency + 1} of ${transactions.length/concurrency} completed.`);
        }

        const endTime = process.hrtime.bigint();
        const totalTimeMs = Number((endTime - startTime) / 1000000n);
        const totalTimeSec = totalTimeMs / 1000;
        const tps = throughputTestCount / totalTimeSec;
        
        console.log(`*** SUCCESS: All ${throughputTestCount} transactions committed.`);
        console.log(`Total time: ${totalTimeSec.toFixed(2)} seconds.`);
        console.log(`Throughput: ${tps.toFixed(2)} TPS`);
        return tps;

    } catch (error) {
        console.error(`*** FAILED: Throughput test failed for payload size ${payloadKB}KB. Error:`, error.message.split('\n')[0]);
        return 0;
    }
}


// --- Helper & Printing Functions ---

function printFinalResults(results) {
    console.log('\n\n==================== FINAL THROUGHPUT RESULTS (Sustained Load) ====================');
    console.table(results);
    console.log('================================================================================');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function newGrpcConnection() {
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
        'grpc.max_send_message_length': -1,
        'grpc.max_receive_message_length': -1,
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
```

the result in the terminal for the test app for the throughput

```bash
--- Starting Final Comprehensive Performance & Throughput Test ---
--- Performing warm-up transaction... ---
Warm-up complete.

--- Testing Throughput: Lightweight ---
Submitting 100 transactions in chunks of 10, with 0KB payload each...
Batch 1 of 10 completed.
Batch 2 of 10 completed.
Batch 3 of 10 completed.
Batch 4 of 10 completed.
Batch 5 of 10 completed.
Batch 6 of 10 completed.
Batch 7 of 10 completed.
Batch 8 of 10 completed.
Batch 9 of 10 completed.
Batch 10 of 10 completed.
*** SUCCESS: All 100 transactions committed.
Total time: 0.63 seconds.
Throughput: 159.24 TPS

--- Testing Throughput: Naive (10KB) ---
Submitting 100 transactions in chunks of 10, with 10KB payload each...
Batch 1 of 10 completed.
Batch 2 of 10 completed.
Batch 3 of 10 completed.
Batch 4 of 10 completed.
Batch 5 of 10 completed.
Batch 6 of 10 completed.
Batch 7 of 10 completed.
Batch 8 of 10 completed.
Batch 9 of 10 completed.
Batch 10 of 10 completed.
*** SUCCESS: All 100 transactions committed.
Total time: 0.70 seconds.
Throughput: 142.65 TPS

--- Testing Throughput: Naive (50KB) ---
Submitting 100 transactions in chunks of 10, with 50KB payload each...
Batch 1 of 10 completed.
Batch 2 of 10 completed.
Batch 3 of 10 completed.
Batch 4 of 10 completed.
Batch 5 of 10 completed.
Batch 6 of 10 completed.
Batch 7 of 10 completed.
Batch 8 of 10 completed.
Batch 9 of 10 completed.
Batch 10 of 10 completed.
*** SUCCESS: All 100 transactions committed.
Total time: 1.31 seconds.
Throughput: 76.34 TPS

--- Testing Throughput: Naive (150KB) ---
Submitting 100 transactions in chunks of 10, with 150KB payload each...
Batch 1 of 10 completed.
Batch 2 of 10 completed.
Batch 3 of 10 completed.
Batch 4 of 10 completed.
Batch 5 of 10 completed.
Batch 6 of 10 completed.
Batch 7 of 10 completed.
Batch 8 of 10 completed.
Batch 9 of 10 completed.
Batch 10 of 10 completed.
*** SUCCESS: All 100 transactions committed.
Total time: 3.01 seconds.
Throughput: 33.23 TPS

--- Testing Throughput: Naive (1MB) ---
Submitting 100 transactions in chunks of 10, with 1024KB payload each...
Batch 1 of 10 completed.
Batch 2 of 10 completed.
Batch 3 of 10 completed.
Batch 4 of 10 completed.
Batch 5 of 10 completed.
Batch 6 of 10 completed.
Batch 7 of 10 completed.
Batch 8 of 10 completed.
Batch 9 of 10 completed.
Batch 10 of 10 completed.
*** SUCCESS: All 100 transactions committed.
Total time: 10.19 seconds.
Throughput: 9.81 TPS


```
<!--
the table 

![image](https://github.com/user-attachments/assets/185ac4fa-2bbd-4123-950e-08c12517e7f6)


with changing the network configuration to this 
``` BatchSize:
    # Max Message Count
    # The maximum number of messages to permit in a batch.
    MaxMessageCount: 500

    # Absolute Max Bytes
    # The absolute maximum number of bytes allowed for
    # the serialized messages in a batch.
    AbsoluteMaxBytes: 99 MB

    # Preferred Max Bytes
    # The preferred maximum number of bytes allowed for
    # the serialized messages in a batch. A message larger than the
    # preferred max bytes will result in a batch larger than preferred max
    # bytes.
    PreferredMaxBytes: 4096 KB
    ```
    and the results were totally diffrent and amazing 
<img width="1572" height="400" alt="image" src="https://github.com/user-attachments/assets/86a9a841-6655-46d7-91eb-f52811642908" />

    
-->

The Table (with running the code multiple times the average of the TPS for the 10KB is 128 and the rest is about the same of the table) 
![image](https://github.com/user-attachments/assets/a76dec41-6977-4857-9b7e-d355daf3b9b6)


then I have changed the network configuration to 
``` YAML
BatchSize:
    # Max Message Count
    # The maximum number of messages to permit in a batch.
    MaxMessageCount: 500

    # Absolute Max Bytes
    # The absolute maximum number of bytes allowed for
    # the serialized messages in a batch.
    AbsoluteMaxBytes: 99 MB

    # Preferred Max Bytes
    # The preferred maximum number of bytes allowed for
    # the serialized messages in a batch. A message larger than the
    # preferred max bytes will result in a batch larger than preferred max
    # bytes.
    PreferredMaxBytes: 4096 KB
```

and the results were diffrent and having major amazing output 

``` bash
Testing Throughput: Lightweight (10000 TXs @ 500 concurrency) ---
Submitting 10000 transactions in chunks of 500, with 0KB payload each...
Batch 1 of 20 completed.
Batch 2 of 20 completed.
Batch 3 of 20 completed.
Batch 4 of 20 completed.
Batch 5 of 20 completed.
Batch 6 of 20 completed.
Batch 7 of 20 completed.
Batch 8 of 20 completed.
Batch 9 of 20 completed.
Batch 10 of 20 completed.
Batch 11 of 20 completed.
Batch 12 of 20 completed.
Batch 13 of 20 completed.
Batch 14 of 20 completed.
Batch 15 of 20 completed.
Batch 16 of 20 completed.
Batch 17 of 20 completed.
Batch 18 of 20 completed.
Batch 19 of 20 completed.
Batch 20 of 20 completed.
*** SUCCESS: All 10000 transactions committed.
Total time: 21.22 seconds.
Throughput: 471.30 TPS

--- Testing Throughput: Naive (10KB) (100 TXs @ 50 concurrency) ---
Submitting 100 transactions in chunks of 50, with 10KB payload each...
Batch 1 of 2 completed.
Batch 2 of 2 completed.
*** SUCCESS: All 100 transactions committed.
Total time: 0.36 seconds.
Throughput: 277.01 TPS

--- Testing Throughput: Naive (50KB) (100 TXs @ 50 concurrency) ---
Submitting 100 transactions in chunks of 50, with 50KB payload each...
Batch 1 of 2 completed.
Batch 2 of 2 completed.
*** SUCCESS: All 100 transactions committed.
Total time: 0.85 seconds.
Throughput: 116.96 TPS

--- Testing Throughput: Naive (150KB) (50 TXs @ 20 concurrency) ---
Submitting 50 transactions in chunks of 20, with 150KB payload each...
Batch 1 of 3 completed.
Batch 2 of 3 completed.
Batch 3 of 3 completed.
*** SUCCESS: All 50 transactions committed.
Total time: 1.05 seconds.
Throughput: 47.39 TPS

--- Testing Throughput: Naive (1MB) (20 TXs @ 10 concurrency) ---
Submitting 20 transactions in chunks of 10, with 1024KB payload each...
Batch 1 of 2 completed.
Batch 2 of 2 completed.
*** SUCCESS: All 20 transactions committed.
Total time: 2.06 seconds.
Throughput: 9.73 TPS

```
and the table shows the results 

<img width="1550" height="391" alt="image" src="https://github.com/user-attachments/assets/0dc7f26e-7df0-47fa-8e95-ac35534ed087" />
