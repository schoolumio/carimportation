-- CreateTable
CREATE TABLE "SandboxProviderRecord" (
    "id" TEXT NOT NULL,
    "providerTxnId" TEXT NOT NULL,
    "type" "ProviderTxnType" NOT NULL,
    "status" "ProviderTxnStatus" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxProviderRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SandboxProviderRecord_providerTxnId_key" ON "SandboxProviderRecord"("providerTxnId");
