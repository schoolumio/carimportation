-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DealerStatus" AS ENUM ('APPLICATION_SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DealerMemberRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "VerificationCheckType" AS ENUM ('IDENTITY', 'BUSINESS_REGISTRATION', 'BUSINESS_ADDRESS', 'BANK_ACCOUNT_OWNERSHIP', 'LICENSE_OR_AUTHORIZATION', 'TRADING_HISTORY', 'SUPPLIER_RELATIONSHIPS');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'PASSED', 'FAILED', 'WAIVED');

-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('AUCTION', 'DEALERSHIP', 'EXPORTER', 'PRIVATE_SELLER', 'OTHER');

-- CreateEnum
CREATE TYPE "SupplyChannel" AS ENUM ('PLATFORM_OWNED', 'DEALER', 'CUSTOMER_SOURCING');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('OVERSEAS_AUCTION', 'OVERSEAS_SUPPLIER_STOCK', 'PURCHASED_OVERSEAS', 'IN_TRANSIT', 'IN_NIGERIA');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('AVAILABLE_FOR_PURCHASE', 'PURCHASED_AWAITING_EXPORT', 'PURCHASED_AWAITING_SHIPMENT', 'SHIPPED_IN_TRANSIT', 'ARRIVED_AWAITING_CLEARANCE', 'AVAILABLE_LOCAL_DELIVERY', 'RESERVED', 'SOLD');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'PUBLISHED', 'REJECTED', 'SUSPENDED', 'EXPIRED', 'SOLD', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ShippingMethod" AS ENUM ('RORO', 'CONTAINER', 'AIR', 'LOCAL_ONLY');

-- CreateEnum
CREATE TYPE "VinVisibility" AS ENUM ('PUBLIC', 'MASKED', 'BUYERS_WITH_ORDER');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "InspectorType" AS ENUM ('INDEPENDENT', 'PLATFORM', 'DEALER', 'AUCTION_HOUSE');

-- CreateEnum
CREATE TYPE "Provenance" AS ENUM ('PLATFORM_VERIFIED', 'INDEPENDENT_REPORT', 'DEALER_DECLARED', 'ESTIMATE');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('OPEN', 'RESPONDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FlagKind" AS ENUM ('FRAUD_REPORT', 'DUPLICATE_SUSPECTED', 'SUSPICIOUS_ACTIVITY', 'PRICE_ANOMALY', 'MISLEADING_INFORMATION');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('INTERNAL', 'BUYER_AND_INTERNAL', 'DEALER_AND_INTERNAL', 'ORDER_PARTIES', 'PUBLIC_LISTING');

-- CreateEnum
CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SourcingStatus" AS ENUM ('OPEN', 'OFFERS_RECEIVED', 'OFFER_ACCEPTED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ChargeNature" AS ENUM ('FIXED', 'QUOTED', 'ESTIMATED', 'VARIABLE');

-- CreateEnum
CREATE TYPE "CalcType" AS ENUM ('FIXED_AMOUNT', 'PERCENT_OF_VEHICLE', 'PERCENT_OF_CIF', 'PERCENT_OF_DUTIABLE', 'PERCENT_OF_SUBTOTAL');

-- CreateEnum
CREATE TYPE "Beneficiary" AS ENUM ('SELLER', 'DEALER', 'PLATFORM', 'AUCTION_HOUSE', 'SHIPPING_PROVIDER', 'INSURER', 'PORT_TERMINAL', 'GOVERNMENT', 'CLEARING_AGENT', 'LOCAL_TRANSPORTER', 'PAYMENT_PROCESSOR', 'CONTINGENCY_RESERVE');

-- CreateEnum
CREATE TYPE "PayableStage" AS ENUM ('UPFRONT', 'ON_ARRIVAL', 'ON_DELIVERY');

-- CreateEnum
CREATE TYPE "QuoteType" AS ENUM ('FIXED_PRICE', 'ESTIMATED_LANDED_COST', 'SOURCING');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('ISSUED', 'ACCEPTED', 'EXPIRED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderPath" AS ENUM ('SOURCE_AND_IMPORT', 'AUCTION_PURCHASE', 'PURCHASED_STOCK', 'IN_TRANSIT_STOCK', 'LOCAL_STOCK');

-- CreateEnum
CREATE TYPE "OrderState" AS ENUM ('ORDER_CREATED', 'COMPLIANCE_CHECK', 'AWAITING_PAYMENT', 'FUNDS_CONFIRMED', 'FUNDS_PROTECTED', 'PURCHASE_AUTHORIZED', 'PURCHASE_COMPLETED', 'INSPECTION_COMPLETED', 'EXPORT_PREPARATION', 'SHIPMENT_BOOKED', 'DEPARTED', 'IN_TRANSIT', 'ARRIVED_NIGERIA', 'CUSTOMS_CLEARANCE', 'RELEASED_FROM_PORT', 'LOCAL_TRANSPORT', 'READY_FOR_HANDOVER', 'DELIVERED', 'ACCEPTANCE_PERIOD', 'ACCEPTED', 'SETTLEMENT', 'COMPLETED', 'PURCHASE_FAILED', 'INSPECTION_FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ComplianceCheckType" AS ENUM ('IDENTITY', 'SANCTIONS_SCREENING', 'SOURCE_OF_FUNDS', 'ENHANCED_DUE_DILIGENCE');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('REQUIRED', 'PASSED', 'FAILED', 'WAIVED');

-- CreateEnum
CREATE TYPE "PaymentProviderKey" AS ENUM ('SANDBOX', 'MANUAL_PILOT', 'LIVE_PARTNER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'PARTIALLY_PAID', 'FAILED', 'EXPIRED', 'REVERSED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('ORDER_PAYMENT', 'ADDITIONAL_COST');

-- CreateEnum
CREATE TYPE "ProviderTxnType" AS ENUM ('COLLECTION', 'REFUND', 'PAYOUT', 'REVERSAL', 'CHARGEBACK');

-- CreateEnum
CREATE TYPE "ProviderTxnStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('UNRECONCILED', 'MATCHED', 'MISMATCHED', 'MISSING_INTERNAL');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'DUPLICATE', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE', 'EQUITY');

-- CreateEnum
CREATE TYPE "EntryDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('NOT_ESTABLISHED', 'SANDBOX_SIMULATED', 'MANUAL_PILOT_ACCOUNT', 'ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SettlementMilestone" AS ENUM ('PURCHASE_VERIFIED', 'VEHICLE_DEPARTED', 'ARRIVED_NIGERIA', 'BUYER_ACCEPTED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('SCHEDULED', 'ELIGIBLE', 'APPROVAL_REQUESTED', 'RELEASED', 'BLOCKED_BY_DISPUTE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProviderKind" AS ENUM ('OCEAN_CARRIER', 'FREIGHT_FORWARDER', 'CLEARING_AGENT', 'LOCAL_TRANSPORTER', 'INSPECTION_AGENCY');

-- CreateEnum
CREATE TYPE "IntegrationMode" AS ENUM ('MANUAL_ONLY', 'SANDBOX', 'LIVE');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PLANNING', 'BOOKED', 'DEPARTED', 'IN_TRANSIT', 'ARRIVED', 'CLEARING', 'RELEASED', 'DELIVERING', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('LOGISTICS_OPERATOR', 'CLEARING_PARTNER', 'DELIVERY_PARTNER');

-- CreateEnum
CREATE TYPE "TrackingSource" AS ENUM ('MANUAL_VERIFIED', 'PROVIDER_API', 'SANDBOX_SIMULATION');

-- CreateEnum
CREATE TYPE "CustomsStatus" AS ENUM ('NOT_STARTED', 'DOCUMENTS_SUBMITTED', 'ASSESSED', 'DUTY_PAID', 'EXAMINATION', 'RELEASED', 'HELD');

-- CreateEnum
CREATE TYPE "CostAdjustmentStatus" AS ENUM ('PENDING_INTERNAL_REVIEW', 'AWAITING_BUYER_APPROVAL', 'APPROVED_BY_BUYER', 'REJECTED_BY_BUYER', 'REJECTED_INTERNALLY', 'CONTRACTUAL_EXCEPTION', 'PAID');

-- CreateEnum
CREATE TYPE "DisputeCategory" AS ENUM ('VEHICLE_NOT_PURCHASED', 'INCORRECT_VEHICLE_OR_VIN', 'UNDISCLOSED_DAMAGE', 'MISSING_DOCUMENTATION', 'SHIPPING_DELAY', 'UNEXPECTED_CHARGES', 'VEHICLE_NOT_DELIVERED', 'DELIVERY_CONDITION', 'DEALER_CANCELLATION', 'SUPPLIER_FAILURE', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'AWAITING_RESPONSE', 'UNDER_INVESTIGATION', 'DECISION_ISSUED', 'CLOSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DisputeOutcome" AS ENUM ('FULL_REFUND', 'PARTIAL_REFUND', 'RELEASE_TO_SELLER', 'REMEDIATION', 'NO_ACTION');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'PENDING_CUSTOMER', 'ESCALATED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMPTZ,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEnc" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ,
    "lastLoginAt" TIMESTAMPTZ,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "revokedAt" TIMESTAMPTZ,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "usedAt" TIMESTAMPTZ,
    "requestIp" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "privileged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "grantedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "BuyerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addressLine" TEXT,
    "city" TEXT,
    "state" TEXT,
    "identityStatus" "IdentityStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "identityType" TEXT,
    "identityNumberEnc" TEXT,
    "identityDocumentId" TEXT,
    "identityReviewedAt" TIMESTAMPTZ,
    "identityReviewedBy" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "BuyerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerOrganization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradingName" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "taxId" TEXT,
    "businessAddress" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'NG',
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "website" TEXT,
    "bio" TEXT,
    "sourcingRelationships" TEXT,
    "tradingHistory" TEXT,
    "status" "DealerStatus" NOT NULL DEFAULT 'APPLICATION_SUBMITTED',
    "approvedAt" TIMESTAMPTZ,
    "suspendedAt" TIMESTAMPTZ,
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumberEnc" TEXT,
    "bankAccountLast4" TEXT,
    "bankAccountVerified" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "DealerOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerMember" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "DealerMemberRole" NOT NULL DEFAULT 'STAFF',
    "isAuthorizedRepresentative" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerVerification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" "DealerStatus" NOT NULL,
    "notes" TEXT,
    "requestedInfo" TEXT,
    "reviewerId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerVerificationCheck" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "checkType" "VerificationCheckType" NOT NULL,
    "status" "CheckStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "documentId" TEXT,
    "notes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ,

    CONSTRAINT "DealerVerificationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerCommercialAgreement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "commissionPercent" DECIMAL(9,4) NOT NULL,
    "fixedFeePerSale" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "feeCurrency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "subscriptionPlan" TEXT,
    "notes" TEXT,
    "effectiveFrom" TIMESTAMPTZ NOT NULL,
    "effectiveTo" TIMESTAMPTZ,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerCommercialAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SupplierType" NOT NULL,
    "country" CHAR(2) NOT NULL,
    "city" TEXT,
    "contact" TEXT,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleListing" (
    "id" TEXT NOT NULL,
    "publicRef" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "supplyChannel" "SupplyChannel" NOT NULL,
    "listingType" "ListingType" NOT NULL,
    "availability" "Availability" NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "dealerOrgId" TEXT,
    "supplierId" TEXT,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "trim" TEXT,
    "bodyStyle" TEXT NOT NULL,
    "vin" TEXT,
    "vinVisibility" "VinVisibility" NOT NULL DEFAULT 'MASKED',
    "mileage" INTEGER NOT NULL,
    "mileageUnit" TEXT NOT NULL DEFAULT 'km',
    "conditionGrade" TEXT,
    "conditionSummary" TEXT NOT NULL,
    "damageDisclosure" TEXT,
    "previousUse" TEXT,
    "ownershipInfo" TEXT,
    "knownDefects" TEXT,
    "requiredRepairs" TEXT,
    "sourceName" TEXT,
    "sourceCountry" CHAR(2) NOT NULL,
    "currentLocation" TEXT NOT NULL,
    "originPort" TEXT,
    "price" DECIMAL(18,2) NOT NULL,
    "priceCurrency" CHAR(3) NOT NULL,
    "dealerFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "shippingMethod" "ShippingMethod" NOT NULL DEFAULT 'RORO',
    "shipmentWindowStart" TIMESTAMPTZ,
    "shipmentWindowEnd" TIMESTAMPTZ,
    "estArrivalStart" TIMESTAMPTZ,
    "estArrivalEnd" TIMESTAMPTZ,
    "inspectedAt" TIMESTAMPTZ,
    "auctionLotNumber" TEXT,
    "auctionDate" TIMESTAMPTZ,
    "auctionFeeEstimate" DECIMAL(18,2),
    "storageDeadline" TIMESTAMPTZ,
    "biddingNotes" TEXT,
    "cancellationTerms" TEXT,
    "warrantyText" TEXT,
    "disclaimer" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "featuredUntil" TIMESTAMPTZ,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMPTZ,
    "expiresAt" TIMESTAMPTZ,
    "moderationNotes" TEXT,
    "duplicateOfId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "VehicleListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleSpecification" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "engineCapacityCc" INTEGER,
    "fuelType" TEXT NOT NULL,
    "transmission" TEXT NOT NULL,
    "drivetrain" TEXT,
    "steering" TEXT NOT NULL DEFAULT 'LHD',
    "exteriorColor" TEXT,
    "interiorColor" TEXT,
    "doors" INTEGER,
    "seats" INTEGER,
    "extras" TEXT,

    CONSTRAINT "VehicleSpecification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleMedia" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleInspection" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "orderId" TEXT,
    "inspectorName" TEXT NOT NULL,
    "inspectorType" "InspectorType" NOT NULL,
    "grade" TEXT,
    "summary" TEXT NOT NULL,
    "passed" BOOLEAN,
    "reportDocumentId" TEXT,
    "inspectedAt" TIMESTAMPTZ NOT NULL,
    "platformReviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" TEXT,
    "recordedById" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleHistoryDisclosure" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "provenance" "Provenance" NOT NULL DEFAULT 'DEALER_DECLARED',
    "documentId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleHistoryDisclosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleFactVerification" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "provenance" "Provenance" NOT NULL,
    "documentId" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "VehicleFactVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedVehicle" (
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedVehicle_pkey" PRIMARY KEY ("userId","listingId")
);

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "dealerOrgId" TEXT,
    "message" TEXT NOT NULL,
    "response" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMPTZ,
    "status" "InquiryStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingFlag" (
    "id" TEXT NOT NULL,
    "kind" "FlagKind" NOT NULL,
    "listingId" TEXT,
    "dealerOrgId" TEXT,
    "reporterId" TEXT,
    "details" TEXT NOT NULL,
    "status" "FlagStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'INTERNAL',
    "reviewStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNotes" TEXT,
    "uploadedById" TEXT NOT NULL,
    "listingId" TEXT,
    "orderId" TEXT,
    "shipmentId" TEXT,
    "dealerOrgId" TEXT,
    "disputeId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcingRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "yearMin" INTEGER NOT NULL,
    "yearMax" INTEGER NOT NULL,
    "trim" TEXT,
    "maxMileage" INTEGER,
    "budgetMax" DECIMAL(18,2) NOT NULL,
    "budgetCurrency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "preferredCountries" TEXT[],
    "fuelType" TEXT,
    "transmission" TEXT,
    "notes" TEXT,
    "status" "SourcingStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcingOffer" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "dealerOrgId" TEXT,
    "submittedById" TEXT NOT NULL,
    "vehicleDescription" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "mileage" INTEGER,
    "sourceCountry" CHAR(2) NOT NULL,
    "vehiclePrice" DECIMAL(18,2) NOT NULL,
    "vehicleCurrency" CHAR(3) NOT NULL,
    "engineCapacityCc" INTEGER,
    "shippingMethod" "ShippingMethod" NOT NULL DEFAULT 'RORO',
    "timelineNotes" TEXT NOT NULL,
    "conditionNotes" TEXT,
    "validUntil" TIMESTAMPTZ NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'SUBMITTED',
    "listingId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcingOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "calcType" "CalcType" NOT NULL,
    "amount" DECIMAL(18,2),
    "currency" CHAR(3),
    "percent" DECIMAL(9,4),
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "nature" "ChargeNature" NOT NULL,
    "refundable" BOOLEAN NOT NULL DEFAULT false,
    "beneficiary" "Beneficiary" NOT NULL,
    "payableStage" "PayableStage" NOT NULL DEFAULT 'UPFRONT',
    "uncertaintyPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "sourceReference" TEXT NOT NULL,
    "verifiedAt" TIMESTAMPTZ,
    "verifiedById" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMPTZ NOT NULL,
    "effectiveTo" TIMESTAMPTZ,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRateSnapshot" (
    "id" TEXT NOT NULL,
    "base" CHAR(3) NOT NULL,
    "quote" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "source" TEXT NOT NULL,
    "capturedAt" TIMESTAMPTZ NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "type" "QuoteType" NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'ISSUED',
    "listingId" TEXT,
    "sourcingOfferId" TEXT,
    "buyerId" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "vehicleSubtotal" DECIMAL(18,2) NOT NULL,
    "logisticsSubtotal" DECIMAL(18,2) NOT NULL,
    "taxesSubtotal" DECIMAL(18,2) NOT NULL,
    "feesSubtotal" DECIMAL(18,2) NOT NULL,
    "contingency" DECIMAL(18,2) NOT NULL,
    "totalEstimate" DECIMAL(18,2) NOT NULL,
    "lowEstimate" DECIMAL(18,2) NOT NULL,
    "highEstimate" DECIMAL(18,2) NOT NULL,
    "payableNow" DECIMAL(18,2) NOT NULL,
    "payableLater" DECIMAL(18,2) NOT NULL,
    "fxSnapshotId" TEXT,
    "fxRate" DECIMAL(18,8),
    "deliveryLocation" TEXT NOT NULL DEFAULT 'LAGOS',
    "etaMinDays" INTEGER NOT NULL,
    "etaMaxDays" INTEGER NOT NULL,
    "assumptions" TEXT[],
    "exclusions" TEXT[],
    "usesUnverifiedRules" BOOLEAN NOT NULL DEFAULT false,
    "validUntil" TIMESTAMPTZ NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLineItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "lowAmount" DECIMAL(18,2) NOT NULL,
    "highAmount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "originalAmount" DECIMAL(18,2),
    "originalCurrency" CHAR(3),
    "nature" "ChargeNature" NOT NULL,
    "calculation" TEXT NOT NULL,
    "ruleId" TEXT,
    "ruleVersion" INTEGER,
    "ruleVerified" BOOLEAN NOT NULL DEFAULT true,
    "applicableDate" TIMESTAMPTZ NOT NULL,
    "payableStage" "PayableStage" NOT NULL,
    "refundable" BOOLEAN NOT NULL,
    "beneficiary" "Beneficiary" NOT NULL,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "listingId" TEXT,
    "dealerOrgId" TEXT,
    "path" "OrderPath" NOT NULL,
    "state" "OrderState" NOT NULL DEFAULT 'ORDER_CREATED',
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "agreedTotal" DECIMAL(18,2) NOT NULL,
    "payableNow" DECIMAL(18,2) NOT NULL,
    "paymentArrangement" TEXT NOT NULL,
    "inspectionPeriodHours" INTEGER NOT NULL DEFAULT 72,
    "acceptanceDeadline" TIMESTAMPTZ,
    "cancelledReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderTransition" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "fromState" "OrderState",
    "toState" "OrderState" NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceDocumentIds" TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "settlementSchedule" JSONB NOT NULL,
    "inspectionPeriodHours" INTEGER NOT NULL,
    "acceptedById" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ NOT NULL,
    "acceptedIp" TEXT,
    "acceptedUserAgent" TEXT,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCheck" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "ComplianceCheckType" NOT NULL,
    "status" "ComplianceStatus" NOT NULL DEFAULT 'REQUIRED',
    "reason" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "provider" "PaymentProviderKey" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL DEFAULT 'ORDER_PAYMENT',
    "costAdjustmentId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "amountReceived" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'CREATED',
    "providerRef" TEXT,
    "instructions" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerPaymentProof" (
    "id" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerPaymentProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderTransaction" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProviderKey" NOT NULL,
    "providerTxnId" TEXT NOT NULL,
    "type" "ProviderTxnType" NOT NULL,
    "status" "ProviderTxnStatus" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "webhookEventId" TEXT,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "reconciliation" "ReconciliationStatus" NOT NULL DEFAULT 'UNRECONCILED',
    "reconciledAt" TIMESTAMPTZ,
    "recordedById" TEXT,
    "approvedById" TEXT,
    "bankStatementRef" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "orderId" TEXT,
    "dealerOrgId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "orderId" TEXT,
    "reversalOfId" TEXT,
    "createdById" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "EntryDirection" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscrowReference" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "PaymentProviderKey" NOT NULL,
    "externalReference" TEXT,
    "status" "EscrowStatus" NOT NULL DEFAULT 'NOT_ESTABLISHED',
    "frozenReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "EscrowReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "disputeId" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ,
    "providerTxnId" TEXT,
    "ledgerTxnId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementInstruction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "milestone" "SettlementMilestone" NOT NULL,
    "beneficiary" "Beneficiary" NOT NULL,
    "dealerOrgId" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'SCHEDULED',
    "eligibleAt" TIMESTAMPTZ,
    "requestedById" TEXT,
    "requestedAt" TIMESTAMPTZ,
    "approvedById" TEXT,
    "releasedAt" TIMESTAMPTZ,
    "ledgerTxnId" TEXT,
    "providerTxnId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "dealerOrgId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "notes" TEXT,
    "providerTxnId" TEXT,
    "ledgerTxnId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProviderKey" NOT NULL,
    "periodStart" TIMESTAMPTZ NOT NULL,
    "periodEnd" TIMESTAMPTZ NOT NULL,
    "matched" INTEGER NOT NULL,
    "mismatched" INTEGER NOT NULL,
    "missingInternal" INTEGER NOT NULL,
    "ledgerBalanced" BOOLEAN NOT NULL,
    "report" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ProviderKind" NOT NULL,
    "integration" "IntegrationMode" NOT NULL DEFAULT 'MANUAL_ONLY',
    "contact" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShippingProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "method" "ShippingMethod" NOT NULL,
    "providerId" TEXT,
    "bookingRef" TEXT,
    "vesselName" TEXT,
    "voyageNumber" TEXT,
    "containerNumber" TEXT,
    "billOfLading" TEXT,
    "originPort" TEXT,
    "destinationPort" TEXT NOT NULL DEFAULT 'Lagos (Apapa / Tin Can)',
    "plannedDeparture" TIMESTAMPTZ,
    "actualDeparture" TIMESTAMPTZ,
    "originalEtaStart" TIMESTAMPTZ,
    "originalEtaEnd" TIMESTAMPTZ,
    "currentEtaStart" TIMESTAMPTZ,
    "currentEtaEnd" TIMESTAMPTZ,
    "actualArrival" TIMESTAMPTZ,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PLANNING',
    "lastUpdateAt" TIMESTAMPTZ,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentAssignment" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AssignmentRole" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLeg" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "fromPlace" TEXT NOT NULL,
    "toPlace" TEXT NOT NULL,
    "carrier" TEXT,
    "reference" TEXT,
    "plannedStart" TIMESTAMPTZ,
    "plannedEnd" TIMESTAMPTZ,
    "actualStart" TIMESTAMPTZ,
    "actualEnd" TIMESTAMPTZ,

    CONSTRAINT "ShipmentLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "milestone" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "recordedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "source" "TrackingSource" NOT NULL,
    "evidenceDocumentId" TEXT,
    "visibleToBuyer" BOOLEAN NOT NULL DEFAULT true,
    "correctsEventId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtaRevision" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "previousStart" TIMESTAMPTZ,
    "previousEnd" TIMESTAMPTZ,
    "newStart" TIMESTAMPTZ NOT NULL,
    "newEnd" TIMESTAMPTZ NOT NULL,
    "reason" TEXT NOT NULL,
    "supportingInfo" TEXT NOT NULL,
    "evidenceDocumentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EtaRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsRecord" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "declarationRef" TEXT,
    "status" "CustomsStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "assessedValue" DECIMAL(18,2),
    "dutyAmount" DECIMAL(18,2),
    "vatAmount" DECIMAL(18,2),
    "leviesAmount" DECIMAL(18,2),
    "clearingFee" DECIMAL(18,2),
    "terminalCharges" DECIMAL(18,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "notes" TEXT,
    "releasedAt" TIMESTAMPTZ,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "CustomsRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostAdjustment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "beneficiary" "Beneficiary" NOT NULL,
    "evidenceDocumentId" TEXT,
    "contractualClause" TEXT,
    "status" "CostAdjustmentStatus" NOT NULL DEFAULT 'PENDING_INTERNAL_REVIEW',
    "submittedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ,
    "buyerDecidedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRecord" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "partnerUserId" TEXT,
    "method" TEXT NOT NULL DEFAULT 'HOME_DELIVERY',
    "address" TEXT NOT NULL,
    "scheduledFor" TIMESTAMPTZ,
    "deliveredAt" TIMESTAMPTZ,
    "recipientName" TEXT,
    "odometerReading" INTEGER,
    "evidenceDocumentId" TEXT,
    "buyerAcknowledgedAt" TIMESTAMPTZ,
    "notes" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "DeliveryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "category" "DisputeCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "freezesFunds" BOOLEAN NOT NULL DEFAULT true,
    "responseDueAt" TIMESTAMPTZ NOT NULL,
    "assignedToId" TEXT,
    "outcome" "DisputeOutcome",
    "refundAmount" DECIMAL(18,2),
    "decisionNotes" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeEvidence" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "partyRole" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "documentId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportConversation" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "orderId" TEXT,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "SupportConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internalNote" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "templateKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ,
    "readAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT,
    "runAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "lockedAt" TIMESTAMPTZ,
    "lockedBy" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "actorId" TEXT,
    "actorRoles" TEXT[],
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SourceCountry" (
    "code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "originPorts" TEXT[],
    "transitDaysMin" INTEGER NOT NULL,
    "transitDaysMax" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "SourceCountry_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "DeliveryLocation" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "localDeliveryDaysMin" INTEGER NOT NULL DEFAULT 1,
    "localDeliveryDaysMax" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "DeliveryLocation_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerProfile_userId_key" ON "BuyerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DealerOrganization_slug_key" ON "DealerOrganization"("slug");

-- CreateIndex
CREATE INDEX "DealerMember_userId_idx" ON "DealerMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DealerMember_orgId_userId_key" ON "DealerMember"("orgId", "userId");

-- CreateIndex
CREATE INDEX "DealerVerification_orgId_createdAt_idx" ON "DealerVerification"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealerVerificationCheck_orgId_checkType_key" ON "DealerVerificationCheck"("orgId", "checkType");

-- CreateIndex
CREATE INDEX "DealerCommercialAgreement_orgId_effectiveFrom_idx" ON "DealerCommercialAgreement"("orgId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleListing_publicRef_key" ON "VehicleListing"("publicRef");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleListing_slug_key" ON "VehicleListing"("slug");

-- CreateIndex
CREATE INDEX "VehicleListing_status_availability_idx" ON "VehicleListing"("status", "availability");

-- CreateIndex
CREATE INDEX "VehicleListing_make_model_year_idx" ON "VehicleListing"("make", "model", "year");

-- CreateIndex
CREATE INDEX "VehicleListing_dealerOrgId_idx" ON "VehicleListing"("dealerOrgId");

-- CreateIndex
CREATE INDEX "VehicleListing_sourceCountry_idx" ON "VehicleListing"("sourceCountry");

-- CreateIndex
CREATE INDEX "VehicleListing_vin_idx" ON "VehicleListing"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleSpecification_listingId_key" ON "VehicleSpecification"("listingId");

-- CreateIndex
CREATE INDEX "VehicleMedia_listingId_sortOrder_idx" ON "VehicleMedia"("listingId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleFactVerification_listingId_field_key" ON "VehicleFactVerification"("listingId", "field");

-- CreateIndex
CREATE INDEX "Inquiry_dealerOrgId_status_idx" ON "Inquiry"("dealerOrgId", "status");

-- CreateIndex
CREATE INDEX "ListingFlag_status_idx" ON "ListingFlag"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_orderId_idx" ON "Document"("orderId");

-- CreateIndex
CREATE INDEX "Document_listingId_idx" ON "Document"("listingId");

-- CreateIndex
CREATE INDEX "Document_dealerOrgId_idx" ON "Document"("dealerOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "SourcingRequest_reference_key" ON "SourcingRequest"("reference");

-- CreateIndex
CREATE INDEX "SourcingRequest_status_idx" ON "SourcingRequest"("status");

-- CreateIndex
CREATE INDEX "PricingRule_active_effectiveFrom_idx" ON "PricingRule"("active", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_code_version_key" ON "PricingRule"("code", "version");

-- CreateIndex
CREATE INDEX "ExchangeRateSnapshot_base_quote_capturedAt_idx" ON "ExchangeRateSnapshot"("base", "quote", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteNumber_key" ON "Quote"("quoteNumber");

-- CreateIndex
CREATE INDEX "Quote_buyerId_idx" ON "Quote"("buyerId");

-- CreateIndex
CREATE INDEX "Quote_listingId_idx" ON "Quote"("listingId");

-- CreateIndex
CREATE INDEX "QuoteLineItem_quoteId_idx" ON "QuoteLineItem"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_quoteId_key" ON "Order"("quoteId");

-- CreateIndex
CREATE INDEX "Order_buyerId_idx" ON "Order"("buyerId");

-- CreateIndex
CREATE INDEX "Order_dealerOrgId_idx" ON "Order"("dealerOrgId");

-- CreateIndex
CREATE INDEX "Order_state_idx" ON "Order"("state");

-- CreateIndex
CREATE UNIQUE INDEX "OrderTransition_orderId_sequence_key" ON "OrderTransition"("orderId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_orderId_key" ON "Contract"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceCheck_orderId_type_key" ON "ComplianceCheck"("orderId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_reference_key" ON "PaymentIntent"("reference");

-- CreateIndex
CREATE INDEX "PaymentIntent_orderId_idx" ON "PaymentIntent"("orderId");

-- CreateIndex
CREATE INDEX "ProviderTransaction_reference_idx" ON "ProviderTransaction"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderTransaction_provider_providerTxnId_key" ON "ProviderTransaction"("provider", "providerTxnId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_scope_key_key" ON "IdempotencyKey"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_code_key" ON "LedgerAccount"("code");

-- CreateIndex
CREATE INDEX "LedgerAccount_orderId_idx" ON "LedgerAccount"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_reference_key" ON "LedgerTransaction"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_reversalOfId_key" ON "LedgerTransaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "LedgerTransaction_orderId_idx" ON "LedgerTransaction"("orderId");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_idx" ON "LedgerEntry"("accountId");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "EscrowReference_orderId_key" ON "EscrowReference"("orderId");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE INDEX "SettlementInstruction_orderId_status_idx" ON "SettlementInstruction"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_reference_key" ON "Shipment"("reference");

-- CreateIndex
CREATE INDEX "ShipmentAssignment_userId_idx" ON "ShipmentAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentAssignment_shipmentId_userId_role_key" ON "ShipmentAssignment"("shipmentId", "userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentLeg_shipmentId_sequence_key" ON "ShipmentLeg"("shipmentId", "sequence");

-- CreateIndex
CREATE INDEX "TrackingEvent_shipmentId_occurredAt_idx" ON "TrackingEvent"("shipmentId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomsRecord_shipmentId_key" ON "CustomsRecord"("shipmentId");

-- CreateIndex
CREATE INDEX "CostAdjustment_orderId_status_idx" ON "CostAdjustment"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRecord_orderId_key" ON "DeliveryRecord"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_reference_key" ON "Dispute"("reference");

-- CreateIndex
CREATE INDEX "Dispute_orderId_status_idx" ON "Dispute"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_key_channel_key" ON "NotificationTemplate"("key", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_channel_readAt_idx" ON "Notification"("userId", "channel", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_seq_key" ON "AuditLog"("seq");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerProfile" ADD CONSTRAINT "BuyerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerMember" ADD CONSTRAINT "DealerMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "DealerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerMember" ADD CONSTRAINT "DealerMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerVerification" ADD CONSTRAINT "DealerVerification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "DealerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerVerificationCheck" ADD CONSTRAINT "DealerVerificationCheck_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "DealerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerCommercialAgreement" ADD CONSTRAINT "DealerCommercialAgreement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "DealerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleListing" ADD CONSTRAINT "VehicleListing_dealerOrgId_fkey" FOREIGN KEY ("dealerOrgId") REFERENCES "DealerOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleListing" ADD CONSTRAINT "VehicleListing_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleSpecification" ADD CONSTRAINT "VehicleSpecification_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleMedia" ADD CONSTRAINT "VehicleMedia_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleInspection" ADD CONSTRAINT "VehicleInspection_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleHistoryDisclosure" ADD CONSTRAINT "VehicleHistoryDisclosure_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleFactVerification" ADD CONSTRAINT "VehicleFactVerification_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedVehicle" ADD CONSTRAINT "SavedVehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedVehicle" ADD CONSTRAINT "SavedVehicle_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_dealerOrgId_fkey" FOREIGN KEY ("dealerOrgId") REFERENCES "DealerOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingFlag" ADD CONSTRAINT "ListingFlag_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingRequest" ADD CONSTRAINT "SourcingRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingOffer" ADD CONSTRAINT "SourcingOffer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SourcingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingOffer" ADD CONSTRAINT "SourcingOffer_dealerOrgId_fkey" FOREIGN KEY ("dealerOrgId") REFERENCES "DealerOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_sourcingOfferId_fkey" FOREIGN KEY ("sourcingOfferId") REFERENCES "SourcingOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "QuoteLineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_dealerOrgId_fkey" FOREIGN KEY ("dealerOrgId") REFERENCES "DealerOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTransition" ADD CONSTRAINT "OrderTransition_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerPaymentProof" ADD CONSTRAINT "BuyerPaymentProof_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTransaction" ADD CONSTRAINT "ProviderTransaction_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "LedgerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowReference" ADD CONSTRAINT "EscrowReference_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementInstruction" ADD CONSTRAINT "SettlementInstruction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_dealerOrgId_fkey" FOREIGN KEY ("dealerOrgId") REFERENCES "DealerOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ShippingProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentAssignment" ADD CONSTRAINT "ShipmentAssignment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentAssignment" ADD CONSTRAINT "ShipmentAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtaRevision" ADD CONSTRAINT "EtaRevision_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsRecord" ADD CONSTRAINT "CustomsRecord_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostAdjustment" ADD CONSTRAINT "CostAdjustment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "DeliveryRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeEvidence" ADD CONSTRAINT "DisputeEvidence_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
