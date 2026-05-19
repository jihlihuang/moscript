# 將 MoScript 部署到 Azure Container Apps

這份文件說明如何把 MoScript 打包成 Docker image，並部署到 Azure Container Apps。程式會放在 Docker image 裡，`public/glyphs` 字圖與 `data/moscript.sqlite` 會放在 Azure Blob Storage。

## 1. 本機建置測試

```bash
docker build -t moscript:latest .
docker run --rm -p 3000:3000 moscript:latest
```

開啟 `http://localhost:3000`。

如果沒有設定 Blob Storage 相關環境變數，應用程式可以啟動，但無法讀取正式的字圖與正式資料庫。

## 2. 上傳資料與字圖到 Blob Storage

先建立 Resource Group、Storage Account 與 Blob container：

```bash
az login
az group create --name moscript-rg --location eastasia

az storage account create \
  --name moscriptblob2026 \
  --resource-group moscript-rg \
  --location eastasia \
  --sku Standard_LRS

az storage container create \
  --account-name moscriptblob2026 \
  --name moscript \
  --auth-mode login
```

取得 Storage Account connection string：

```bash
az storage account show-connection-string \
  --name moscriptblob2026 \
  --resource-group moscript-rg \
  --query connectionString \
  --output tsv
```

在本機設定環境變數：

```bash
export AZURE_STORAGE_CONNECTION_STRING="<connection-string>"
export AZURE_STORAGE_CONTAINER_NAME="moscript"
export MOSCRIPT_DB_BLOB_NAME="data/moscript.sqlite"
export MOSCRIPT_GLYPHS_PREFIX="glyphs"
```

上傳目前的字圖與 SQLite 資料庫：

```bash
npm run upload:blob
```

## 3. 推送 Docker Image

建議使用 Azure Container Registry，也可以改用 Docker Hub 或 GitHub Container Registry。

### 選項 A：Azure Container Registry

```bash
az provider register --namespace Microsoft.ContainerRegistry
az acr create --resource-group moscript-rg --name moscriptacr2026 --sku Basic

az acr build \
  --registry moscriptacr2026 \
  --image moscript:latest \
  --platform linux/amd64 \
  .
```

如果你是在 Apple Silicon Mac 上部署，建議使用上面的 `az acr build`，讓 Azure 在雲端替你建置 `linux/amd64` image。不要直接在本機用一般 `docker build` 後推送，否則 Docker 可能會推送 `linux/arm64` image，Azure Container Apps 會出現 `image OS/Arc must be linux/amd64 but found linux/arm64`。

### 選項 B：Docker Hub

```bash
docker tag moscript:latest <dockerhub-user>/moscript:latest
docker push <dockerhub-user>/moscript:latest
```

## 4. 建立 Container App

```bash
az extension add --name containerapp --upgrade

az containerapp env create \
  --name moscript-env \
  --resource-group moscript-rg \
  --location eastasia

az containerapp create \
  --name moscript \
  --resource-group moscript-rg \
  --environment moscript-env \
  --image moscriptacr2026.azurecr.io/moscript:latest \
  --target-port 3000 \
  --ingress external \
  --cpu 0.25 \
  --memory 0.5Gi \
  --min-replicas 0 \
  --max-replicas 1 \
  --registry-server moscriptacr2026.azurecr.io \
  --registry-identity system
```

如果前一次建立失敗，`moscript` 可能會留下 `ProvisioningState: Failed` 的資源。這時先刪除失敗的 Container App，再重新執行上面的建立指令：

```bash
az containerapp delete \
  --name moscript \
  --resource-group moscript-rg \
  --yes
```

接著加入 Blob Storage 設定。Connection string 建議存成 secret：

```bash
az containerapp secret set \
  --name moscript \
  --resource-group moscript-rg \
  --secrets azure-storage-connection-string="<connection-string>"

az containerapp update \
  --name moscript \
  --resource-group moscript-rg \
  --set-env-vars \
    AZURE_STORAGE_CONNECTION_STRING=secretref:azure-storage-connection-string \
    AZURE_STORAGE_CONTAINER_NAME=moscript \
    MOSCRIPT_DB_BLOB_NAME=data/moscript.sqlite \
    MOSCRIPT_GLYPHS_PREFIX=glyphs \
    MOSCRIPT_DATA_DIR=/tmp/moscript-data
```

如果使用 ACR，`<image-name>` 是：

```text
moscriptacr2026.azurecr.io/moscript:latest
```

如果使用 Docker Hub，`<image-name>` 是：

```text
<dockerhub-user>/moscript:latest
```

## 5. 查看網站網址

```bash
az containerapp show \
  --name moscript \
  --resource-group moscript-rg \
  --query properties.configuration.ingress.fqdn \
  --output tsv
```

## 一鍵更新程式

第一次部署完成後，未來只更新程式時可以使用部署腳本：

```bash
npm run deploy:azure
```

部署腳本會自動讀取 repo 根目錄的 `.env.deploy`。目前範例內容：

```bash
AZURE_RESOURCE_GROUP=moscript-rg
AZURE_CONTAINER_APP_NAME=moscript
AZURE_ACR_NAME=moscriptacr2026
AZURE_IMAGE_REPOSITORY=moscript
DOCKER_PLATFORM=linux/amd64
AZURE_BUILD_MODE=acr
```

可選設定：

```bash
export AZURE_IMAGE_REPOSITORY="moscript"
export AZURE_IMAGE_TAG="$(date +%Y%m%d%H%M%S)"
export DOCKER_PLATFORM="linux/amd64"
export AZURE_BUILD_MODE="acr"
```

腳本會執行：

```bash
az acr build --registry "$AZURE_ACR_NAME" --image "<repo>:<tag>" --platform "$DOCKER_PLATFORM" .
az containerapp update --name "$AZURE_CONTAINER_APP_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --image "<image>"
```

如果你確定本機 Docker 可以穩定跨架構 build，也可以改用本機 build：

```bash
export AZURE_BUILD_MODE="local"
npm run deploy:azure
```

這個指令只會更新應用程式 image。只有在 `public/glyphs` 或 `data/moscript.sqlite` 需要重新上傳時，才需要再執行：

```bash
npm run upload:blob
```

## 資料注意事項

應用程式現在會把字圖存放在 Azure Blob Storage，並在容器啟動時從 Blob Storage 下載 `data/moscript.sqlite`。

SQLite 仍然是單檔資料庫，因此 Container App 請維持 `--max-replicas 1`。如果未來要支援更高流量或多副本正式環境，建議改用受控資料庫。

## 查不到字時的處理

如果網站可以開啟，但搜尋不到任何字，通常是 Blob Storage 上的 SQLite 資料庫沒有最新資料，或 Container App 還在使用舊的本機暫存 DB。

先確認本機資料庫有資料：

```bash
sqlite3 data/moscript.sqlite "select count(*) from glyphs;"
```

重新上傳 Blob 資料。上傳腳本會先把 SQLite WAL checkpoint 回主資料庫，再上傳 `data/moscript.sqlite`：

```bash
export AZURE_STORAGE_CONNECTION_STRING="<connection-string>"
export AZURE_STORAGE_CONTAINER_NAME="moscript"
export MOSCRIPT_DB_BLOB_NAME="data/moscript.sqlite"
export MOSCRIPT_GLYPHS_PREFIX="glyphs"

npm run upload:blob
```

上傳完成後，重啟 Container App，讓它重新從 Blob 下載 SQLite：

```bash
REVISION_NAME=$(az containerapp revision list \
  --name moscript \
  --resource-group moscript-rg \
  --query "[?properties.active].name | [0]" \
  --output tsv)

az containerapp revision restart \
  --name moscript \
  --resource-group moscript-rg \
  --revision "$REVISION_NAME"
```

如果 `revision restart` 不可用，可以用更新環境變數的方式觸發新 revision：

```bash
az containerapp update \
  --name moscript \
  --resource-group moscript-rg \
  --set-env-vars MOSCRIPT_RESTART_AT="$(date +%s)"
```

也可以使用 npm 指令：

```bash
export AZURE_RESOURCE_GROUP="moscript-rg"
export AZURE_CONTAINER_APP_NAME="moscript"

npm run restart:azure
```

也可以查看即時 logs：

```bash
az containerapp logs show \
  --name moscript \
  --resource-group moscript-rg \
  --follow
```

## 刪除 Azure 資源

```bash
az group delete --name moscript-rg
```
