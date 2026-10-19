PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS billingLocks (
  uid TEXT PRIMARY KEY CHECK(length(uid) BETWEEN 1 AND 128),
  nonce TEXT NOT NULL,
  untilMs INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS billingOrders (
  orderId TEXT PRIMARY KEY CHECK(length(orderId) = 36),
  uid TEXT NOT NULL CHECK(length(uid) BETWEEN 1 AND 128),
  sku TEXT NOT NULL CHECK(sku = '4j_adfree_lifetime'),
  amountCents INTEGER NOT NULL CHECK(amountCents = 500),
  currency TEXT NOT NULL CHECK(currency = 'BRL'),
  collectorId TEXT NOT NULL,
  applicationId TEXT NOT NULL,
  liveMode INTEGER NOT NULL CHECK(liveMode IN (0, 1)),
  projectId TEXT NOT NULL,
  requestPayload TEXT NOT NULL CHECK(json_valid(requestPayload)),
  expiresAt TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  providerOrderId TEXT UNIQUE CHECK(providerOrderId IS NULL OR (providerOrderId GLOB 'ORD*' AND length(providerOrderId) IN (29, 32))),
  providerStatus TEXT,
  providerUpdatedAt TEXT,
  checkedAt INTEGER,
  paid INTEGER NOT NULL DEFAULT 0 CHECK(paid IN (0, 1)),
  UNIQUE(orderId, uid)
);
CREATE INDEX IF NOT EXISTS billingOrders_owner_paid ON billingOrders(uid, paid);

CREATE TABLE IF NOT EXISTS billingAccounts (
  uid TEXT PRIMARY KEY CHECK(length(uid) BETWEEN 1 AND 128),
  activeOrderId TEXT,
  orderDay TEXT,
  ordersToday INTEGER NOT NULL DEFAULT 0 CHECK(ordersToday BETWEEN 0 AND 5),
  lastCreatedAt INTEGER NOT NULL DEFAULT 0,
  adFreeLifetime INTEGER NOT NULL DEFAULT 0 CHECK(adFreeLifetime IN (0, 1)),
  updatedAt INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(activeOrderId, uid) REFERENCES billingOrders(orderId, uid)
);

CREATE TRIGGER IF NOT EXISTS billingOrders_immutable
BEFORE UPDATE OF orderId, uid, sku, amountCents, currency, collectorId, applicationId, liveMode, projectId, requestPayload, expiresAt, createdAt
ON billingOrders
BEGIN
  SELECT RAISE(ABORT, 'immutable billing reservation');
END;

CREATE TRIGGER IF NOT EXISTS billingOrders_provider_immutable
BEFORE UPDATE OF providerOrderId ON billingOrders
WHEN OLD.providerOrderId IS NOT NULL AND (NEW.providerOrderId IS NULL OR NEW.providerOrderId <> OLD.providerOrderId)
BEGIN
  SELECT RAISE(ABORT, 'provider order already bound');
END;

CREATE TRIGGER IF NOT EXISTS billingOrders_paid_limit
BEFORE UPDATE OF paid ON billingOrders
WHEN NEW.paid = 1 AND OLD.paid = 0 AND (SELECT COUNT(*) FROM billingOrders WHERE uid = NEW.uid AND paid = 1) >= 10
BEGIN
  SELECT RAISE(ABORT, 'billing paid order limit');
END;

CREATE TRIGGER IF NOT EXISTS billingOrders_paid_insert_limit
BEFORE INSERT ON billingOrders
WHEN NEW.paid = 1 AND (SELECT COUNT(*) FROM billingOrders WHERE uid = NEW.uid AND paid = 1) >= 10
BEGIN
  SELECT RAISE(ABORT, 'billing paid order limit');
END;
