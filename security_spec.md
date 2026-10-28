# Security Specification & Threat Model (LaundraPro Secure Engine)

This document formalizes the validation constraints, authorization structures, and relational security boundaries for LaundraPro's dynamic Firestore integration.

## 1. Core Data Invariants

1. **Owner Exclusivity (Isolation)**: Users may only read or write fields that reside strictly inside their own subcollections defined at `users/{userId}/...`. Identity matching ensures `request.auth.uid == userId`.
2. **Value Soundness**: No financial amount can be negative or empty.
3. **Immutability of Metadata**: The parent path identity and registration `userId` are established on creation and are immutable.
4. **Time Veracity**: Timestamps `createdAt` or `updatedAt` are strictly synchronized with the database environment `request.time`.

---

## 2. The "Dirty Dozen" Threat Payloads

Below are the 12 specific hostile payloads attempting to subvert data limits, bypass validation gates, or intercept other users' databases:

### Payload 1: Spawning records for spoofed targets
```json
// Path: /users/bob_victim_uid/expenses/exp_01
// Attacker signed-in as Alice (uid: alice_uid)
{
  "id": "exp_01",
  "title": "Sabun Cair Premium",
  "amount": 150000,
  "category": "Detergen & Sabun",
  "date": "2026-05-21",
  "paymentMethod": "Tunai",
  "userId": "bob_victim_uid"
}
// EXPECTED OUTCOME: PERMISSION_DENIED (Identity mismatch)
```

### Payload 2: Hostile negative amount
```json
// Path: /users/alice_uid/expenses/exp_02
{
  "id": "exp_02",
  "title": "Penyusutan Nilai",
  "amount": -500000,
  "category": "Lain-lain",
  "date": "2026-05-21",
  "paymentMethod": "Tunai",
  "userId": "alice_uid"
}
// EXPECTED OUTCOME: PERMISSION_DENIED (Validation limits sound check failed)
```

### Payload 3: Excessively huge item names (Denial of Wallet)
```json
// Path: /users/alice_uid/expenses/exp_03
{
  "id": "exp_03",
  "title": "[1.1 megabytes of repeat AAA strings...]",
  "amount": 25000,
  "category": "Detergen & Sabun",
  "date": "2026-05-21",
  "paymentMethod": "Tunai",
  "userId": "alice_uid"
}
// EXPECTED OUTCOME: PERMISSION_DENIED (Size limits validation check failed)
```

### Payload 4: Invalid payment method type injection
```json
// Path: /users/alice_uid/expenses/exp_04
{
  "id": "exp_04",
  "title": "Token Air PAM",
  "amount": 100000,
  "category": "Listrik & Air",
  "date": "2026-05-21",
  "paymentMethod": "CRYPTO_SPOOF",
  "userId": "alice_uid"
}
// EXPECTED OUTCOME: PERMISSION_DENIED (Enum validation failed)
```

### Payload 5: Date string injection of binary shell code
```json
// Path: /users/alice_uid/expenses/exp_05
{
  "id": "exp_05",
  "title": "Detergen",
  "amount": 85000,
  "category": "Detergen & Sabun",
  "date": "DELETE * FROM DB;",
  "paymentMethod": "Tunai",
  "userId": "alice_uid"
}
// EXPECTED OUTCOME: PERMISSION_DENIED (Regex format match failed)
```

### Payload 6: Modifying owner ID on update
```json
// Alice attempts to update Alice's record but changes `userId` to Target Bob's UID
// Path: /users/alice_uid/expenses/exp_06
{
  "id": "exp_06",
  "title": "Pembersih",
  "amount": 40000,
  "category": "Detergen & Sabun",
  "date": "2026-05-21",
  "paymentMethod": "Tunai",
  "userId": "bob_victim_uid"
}
// EXPECTED OUTCOME: PERMISSION_DENIED (Immutable field change detection)
```

### Payload 7: Deleting historical records without verified status
```json
// Path: /users/alice_uid/expenses/exp_07
// Attempt deletion with request.auth.token.email_verified == false
// EXPECTED OUTCOME: PERMISSION_DENIED (Security verification required)
```

### Payload 8: Creating category tag with dangerous hex formats
```json
// Path: /users/alice_uid/categories/CustomSabun
{
  "name": "CustomSabun",
  "color": "rgb(0,0,0); DROP TABLE;",
  "bgColor": "bg-rose-500",
  "icon": "Tag",
  "userId": "alice_uid"
}
// EXPECTED OUTCOME: PERMISSION_DENIED (Hex color pattern failed)
```

### Payload 9: Hijacking master variables with shadow field injections
```json
// Path: /users/alice_uid/expenses/exp_09
{
  "id": "exp_09",
  "title": "Beli Pewangi Molto",
  "amount": 45000,
  "category": "Detergen & Sabun",
  "date": "2026-05-21",
  "paymentMethod": "Tunai",
  "userId": "alice_uid",
  "role": "admin",
  "bypassCheck": true
}
// EXPECTED OUTCOME: PERMISSION_DENIED (Extraneous / Shadow fields key count mismatch)
```

### Payload 10: Intercepting private profiles in bulk
```json
// Signed in as Alice, attempting a query list reading bob_victim_uid collections directly
// EXPECTED OUTCOME: PERMISSION_DENIED (Rule enforces strict query checks matching active UID)
```

### Payload 11: Injecting mock UI scripts inside the category description
```json
// Path: /users/alice_uid/categories/XSS
{
  "name": "<script>alert('compromised')</script>",
  "color": "#10b981",
  "bgColor": "bg-emerald-900 border-2",
  "icon": "Tag",
  "userId": "alice_uid"
}
// EXPECTED OUTCOME: PERMISSION_DENIED (Category text name checks failed)
```

### Payload 12: Updating dynamic fields with incompatible variable types
```json
// Path: /users/alice_uid/expenses/exp_12
// Attempting to change amount to a string representation "Rp 150.000"
// EXPECTED OUTCOME: PERMISSION_DENIED (Type sound check validation failed)
```

---

## 3. Dynamic Test Runner Simulation

A local continuous checking framework enforces these requirements through offline checking and client mock environments before deploying rules.
