import { createNewswireReleaseStore } from "./newswire-release-store.mjs";
import { createNewswirePaidQueryActor } from "./paid-newswire-query.mjs";
import { createNewswireSubscriptionQueryHandlers } from "./newswire-subscription.mjs";
import { createNewswireSubscriptionResource } from "./newswire-subscription-resource.mjs";

// Production composition: original Newsroom acceptance -> content-addressed
// immutable Newswire release -> original x402 seller. A returned offering is
// not a claim that the seller was deployed, paid, or independently received.
//
// Pass onRelease directly to the original createNewswireService({onRelease})
// option, and host the returned original seller actor using its Web owner.
// There is no second price policy, wallet, feed renderer, or shop catalog.
export async function createNewswireCommerce({
  releaseRoot, byteStore, verifyEditorialRelease, now,
  admitQuery, queryReleased, qualifyRights, authorizeRequest,
  sellerOffer, priceTerms, append, recoveredRecords, basePath,
  facilitatorUrl, facilitatorClient, paymentIdentity, settlementProjection,
  maxSnapshotAgeMs, maxSnapshotItems, maxSnapshotBytes, maxResponseBytes,
  actorFactory, paymentBoundaryFactory, subscriptionAccess, subscriptionPath, subscriptionAuthenticationChallenge,
}={}) {
  if (typeof admitQuery !== "function" || typeof queryReleased !== "function") {
    throw new TypeError("original Newswire query admission and execution are mandatory");
  }
  if ((subscriptionPath !== undefined || subscriptionAuthenticationChallenge !== undefined) && subscriptionAccess === undefined)
    throw new TypeError("a subscription route requires its original access providers");
  const custody = createNewswireReleaseStore({
    root: releaseRoot, byteStore, verifyRelease: verifyEditorialRelease, now,
  });
  const subscriptions = subscriptionAccess === undefined ? undefined : createNewswireSubscriptionQueryHandlers({
    ...subscriptionAccess,
    snapshotStore: custody, verifySnapshot: custody.verifySnapshot,
    admitQuery, queryReleased, qualifyRights, authorizeRequest,
    ...(now === undefined ? {} : {now:()=>Date.parse(now())}),
    ...(maxSnapshotAgeMs === undefined ? {} : {maxSnapshotAgeMs}),
    ...(maxSnapshotItems === undefined ? {} : {maxSnapshotItems}),
    ...(maxSnapshotBytes === undefined ? {} : {maxSnapshotBytes}),
    ...(maxResponseBytes === undefined ? {} : {maxResponseBytes}),
  });
  const subscriptionResources = subscriptions === undefined ? undefined : Object.freeze([
    createNewswireSubscriptionResource({
      subscriptions,
      ...(subscriptionPath === undefined ? {} : {path: subscriptionPath}),
      ...(subscriptionAuthenticationChallenge === undefined ? {} : {authenticationChallenge: subscriptionAuthenticationChallenge}),
    }),
  ]);
  const seller = await createNewswirePaidQueryActor({
    snapshotStore: custody,
    verifySnapshot: custody.verifySnapshot,
    admitQuery, queryReleased, qualifyRights, authorizeRequest,
    sellerOffer, priceTerms, append, recoveredRecords,
    ...(now === undefined ? {} : {now:()=>Date.parse(now())}),
    ...(basePath === undefined ? {} : {basePath}),
    ...(facilitatorUrl === undefined ? {} : {facilitatorUrl}),
    ...(facilitatorClient === undefined ? {} : {facilitatorClient}),
    ...(paymentIdentity === undefined ? {} : {paymentIdentity}),
    ...(settlementProjection === undefined ? {} : {settlementProjection}),
    ...(maxSnapshotAgeMs === undefined ? {} : {maxSnapshotAgeMs}),
    ...(maxSnapshotItems === undefined ? {} : {maxSnapshotItems}),
    ...(maxSnapshotBytes === undefined ? {} : {maxSnapshotBytes}),
    ...(maxResponseBytes === undefined ? {} : {maxResponseBytes}),
    ...(actorFactory === undefined ? {} : {actorFactory}),
    ...(paymentBoundaryFactory === undefined ? {} : {paymentBoundaryFactory}),
  });
  return Object.freeze({
    seller,
    snapshotStore: custody,
    onRelease: wire => custody.publish({wire}),
    ...(subscriptions === undefined ? {} : {
      subscriptions,
      subscriptionResources,
    }),
  });
}
