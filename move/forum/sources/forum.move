#[allow(duplicate_alias, unused_const, unused_function, lint(custom_state_change))]
module forum::forum {
    use iota::event;
    use iota::clock::Clock;
    use iota::table::{Self, Table};
    use iota::coin::{Self, Coin};
    use iota::balance::{Self, Balance};
    use iota::iota::IOTA;
    use std::string::{Self, String};

    // ── Role levels (higher = more permissions) ─────────────────────
    const ROLE_BANNED: u8 = 0;
    const ROLE_USER: u8 = 1;
    const ROLE_MODERATOR: u8 = 2;
    const ROLE_ADMIN: u8 = 3;

    // ── Escrow status codes ─────────────────────────────────────────
    const ESCROW_CREATED: u8 = 0;
    const ESCROW_DELIVERED: u8 = 1;
    const ESCROW_DISPUTED: u8 = 2;
    const ESCROW_RESOLVED: u8 = 3;

    // ── Fee constants ───────────────────────────────────────────────
    const MARKETPLACE_FEE_DIVISOR: u64 = 20;
    const ESCROW_FEE_DIVISOR: u64 = 50;
    const VOTES_REQUIRED: u64 = 2;

    // ── Errors ──────────────────────────────────────────────────────
    const E_FORUM_MISMATCH: u64 = 0;
    const E_NOT_REGISTERED: u64 = 1;
    const E_ALREADY_REGISTERED: u64 = 2;
    const E_INSUFFICIENT_ROLE: u64 = 3;
    const E_BANNED: u64 = 4;
    const E_CANNOT_CHANGE_OWN_ROLE: u64 = 5;
    const E_CANNOT_PROMOTE_ABOVE_SELF: u64 = 6;
    const E_TARGET_NOT_REGISTERED: u64 = 7;
    const E_INSUFFICIENT_PAYMENT: u64 = 8;
    const E_TIER_NOT_FOUND: u64 = 9;
    const E_NO_SUBSCRIPTION: u64 = 10;
    const E_SUBSCRIPTION_EXPIRED: u64 = 11;
    const E_SUBSCRIPTION_TIER_TOO_LOW: u64 = 12;
    const E_CONTENT_NOT_FOUND: u64 = 13;
    const E_CONTENT_ALREADY_EXISTS: u64 = 14;
    const E_ALREADY_PURCHASED: u64 = 15;
    const E_BADGE_NOT_FOUND: u64 = 16;
    const E_ALREADY_HAS_BADGE: u64 = 17;
    const E_NOT_ESCROW_PARTY: u64 = 18;
    const E_ESCROW_WRONG_STATUS: u64 = 19;
    const E_ALREADY_VOTED: u64 = 20;
    const E_ESCROW_NOT_RESOLVED: u64 = 21;
    const E_INVALID_RATING: u64 = 22;
    const E_CANNOT_TIP_SELF: u64 = 23;
    const E_ZERO_AMOUNT: u64 = 24;
    const E_INSUFFICIENT_TREASURY: u64 = 25;
    const E_ONLY_SELLER: u64 = 26;
    const E_ONLY_BUYER: u64 = 27;
    const E_CANNOT_BE_OWN_SELLER: u64 = 28;
    const E_CANNOT_BE_OWN_ARBITRATOR: u64 = 29;
    const E_SELLER_CANNOT_BE_ARBITRATOR: u64 = 30;
    const E_DEADLINE_IN_PAST: u64 = 31;
    const E_CANNOT_RATE_SELF: u64 = 32;
    const E_OWN_CONTENT: u64 = 33;
    const E_ESCROW_EXPIRED: u64 = 34;
    const E_ALREADY_RATED: u64 = 35;
    const E_NOT_EXPIRED: u64 = 36;
    const E_ALREADY_RESOLVED: u64 = 37;
    const E_CANNOT_FOLLOW_SELF: u64 = 38;
    const E_ALREADY_FOLLOWING: u64 = 39;
    const E_NOT_FOLLOWING: u64 = 40;
    const E_POLL_NOT_FOUND: u64 = 41;
    const E_POLL_CLOSED: u64 = 42;
    const E_POLL_EXPIRED: u64 = 43;
    const E_POLL_ALREADY_VOTED: u64 = 44;
    const E_INVALID_OPTION: u64 = 45;
    const E_POLL_ALREADY_EXISTS: u64 = 46;
    const E_PROPOSAL_NOT_FOUND: u64 = 47;
    const E_PROPOSAL_CLOSED: u64 = 48;
    const E_PROPOSAL_EXPIRED: u64 = 49;
    const E_PROPOSAL_ALREADY_VOTED: u64 = 50;
    const E_PROPOSAL_ALREADY_EXISTS: u64 = 51;
    const E_NOT_POLL_CREATOR_OR_ADMIN: u64 = 52;
    const E_NOT_PROPOSAL_CREATOR_OR_ADMIN: u64 = 53;

    // ── Proposal status codes ──────────────────────────────────────
    const PROPOSAL_ACTIVE: u8 = 0;
    const PROPOSAL_PASSED: u8 = 1;
    const PROPOSAL_REJECTED: u8 = 2;
    const PROPOSAL_EXPIRED: u8 = 3;

    // ── Structs ─────────────────────────────────────────────────────

    public struct SubscriptionTier has store, drop, copy {
        price: u64,
        duration_ms: u64,
        features: u64,
    }

    public struct Subscription has store, drop, copy {
        tier: u8,
        expires_at: u64,
    }

    public struct PaidContent has store {
        author: address,
        price: u64,
        buyers: Table<address, bool>,
    }

    public struct Badge has store, drop, copy {
        name: String,
        price: u64,
    }

    public struct UserReputation has store, drop, copy {
        total_trades: u64,
        successful: u64,
        disputes_won: u64,
        disputes_lost: u64,
        total_volume: u64,
        rating_sum: u64,
        rating_count: u64,
    }

    public struct Poll has store {
        creator: address,
        options_count: u8,
        votes: Table<address, u8>,
        deadline: u64,
        closed: bool,
    }

    public struct Proposal has store {
        creator: address,
        quorum: u64,
        yes_votes: vector<address>,
        no_votes: vector<address>,
        deadline: u64,
        status: u8,
    }

    // ── 6 Shared objects ────────────────────────────────────────────

    /// Minimal forum object — only tracks events and admin.
    public struct Forum has key, store {
        id: UID,
        admin: address,
        event_count: u64,
    }

    /// User registry — registrations, roles, and social graph.
    public struct UserRegistry has key, store {
        id: UID,
        users: Table<address, u8>,
        user_count: u64,
        follows: Table<address, vector<address>>,
    }

    /// Treasury — collects fees.
    public struct Treasury has key, store {
        id: UID,
        balance: Balance<IOTA>,
    }

    /// Subscription store — tiers and user subscriptions.
    public struct SubscriptionStore has key, store {
        id: UID,
        tiers: Table<u8, SubscriptionTier>,
        user_subscriptions: Table<address, Subscription>,
    }

    /// Marketplace store — paid content, badges, reputations.
    public struct MarketplaceStore has key, store {
        id: UID,
        paid_contents: Table<String, PaidContent>,
        user_purchases: Table<address, vector<String>>,
        badges: Table<u8, Badge>,
        user_badges: Table<address, vector<u8>>,
        reputations: Table<address, UserReputation>,
    }

    /// Governance store — polls and proposals.
    public struct GovernanceStore has key, store {
        id: UID,
        polls: Table<String, Poll>,
        proposals: Table<String, Proposal>,
    }

    /// Capability object — only the forum creator holds this.
    public struct AdminCap has key, store {
        id: UID,
        forum_id: ID,
    }

    /// Escrow — separate shared object for multi-sig trades.
    public struct Escrow has key, store {
        id: UID,
        buyer: address,
        seller: address,
        arbitrator: address,
        amount: u64,
        description: String,
        deadline: u64,
        status: u8,
        release_votes: vector<address>,
        refund_votes: vector<address>,
        rated_by: vector<address>,
        balance: Balance<IOTA>,
    }

    // ── Events ──────────────────────────────────────────────────────

    public struct ForumEvent has copy, drop {
        tag: String,
        entity_id: String,
        data: vector<u8>,
        version: u64,
        author: address,
        timestamp: u64,
    }

    public struct RoleChanged has copy, drop {
        user: address,
        old_role: u8,
        new_role: u8,
        changed_by: address,
        timestamp: u64,
    }

    public struct TipEvent has copy, drop {
        from: address,
        to: address,
        post_id: String,
        amount: u64,
        timestamp: u64,
    }

    public struct SubscriptionEvent has copy, drop {
        user: address,
        tier: u8,
        expires_at: u64,
        timestamp: u64,
    }

    public struct PurchaseEvent has copy, drop {
        buyer: address,
        content_id: String,
        author: address,
        amount: u64,
        fee: u64,
        timestamp: u64,
    }

    public struct BadgeEvent has copy, drop {
        user: address,
        badge_id: u8,
        timestamp: u64,
    }

    public struct EscrowCreated has copy, drop {
        escrow_id: ID,
        buyer: address,
        seller: address,
        arbitrator: address,
        amount: u64,
        deadline: u64,
        timestamp: u64,
    }

    public struct EscrowUpdated has copy, drop {
        escrow_id: ID,
        action: String,
        actor: address,
        timestamp: u64,
    }

    public struct RatingEvent has copy, drop {
        escrow_id: ID,
        rater: address,
        rated: address,
        score: u8,
        comment: String,
        timestamp: u64,
    }

    // ── Init ────────────────────────────────────────────────────────

    fun init(ctx: &mut TxContext) {
        let sender = ctx.sender();

        let forum = Forum {
            id: object::new(ctx),
            admin: sender,
            event_count: 0,
        };

        let mut registry = UserRegistry {
            id: object::new(ctx),
            users: table::new(ctx),
            user_count: 1,
            follows: table::new(ctx),
        };
        table::add(&mut registry.users, sender, ROLE_ADMIN);

        let treasury = Treasury {
            id: object::new(ctx),
            balance: balance::zero(),
        };

        let sub_store = SubscriptionStore {
            id: object::new(ctx),
            tiers: table::new(ctx),
            user_subscriptions: table::new(ctx),
        };

        let marketplace = MarketplaceStore {
            id: object::new(ctx),
            paid_contents: table::new(ctx),
            user_purchases: table::new(ctx),
            badges: table::new(ctx),
            user_badges: table::new(ctx),
            reputations: table::new(ctx),
        };

        let governance = GovernanceStore {
            id: object::new(ctx),
            polls: table::new(ctx),
            proposals: table::new(ctx),
        };

        let admin_cap = AdminCap {
            id: object::new(ctx),
            forum_id: object::id(&forum),
        };

        transfer::share_object(forum);
        transfer::share_object(registry);
        transfer::share_object(treasury);
        transfer::share_object(sub_store);
        transfer::share_object(marketplace);
        transfer::share_object(governance);
        transfer::transfer(admin_cap, sender);
    }

    // ── Internal helpers ────────────────────────────────────────────

    fun get_role(registry: &UserRegistry, user: address): u8 {
        if (table::contains(&registry.users, user)) {
            *table::borrow(&registry.users, user)
        } else {
            0
        }
    }

    fun assert_active_user(registry: &UserRegistry, user: address) {
        assert!(table::contains(&registry.users, user), E_NOT_REGISTERED);
        let role = *table::borrow(&registry.users, user);
        assert!(role > ROLE_BANNED, E_BANNED);
    }

    fun assert_min_role(registry: &UserRegistry, user: address, min_role: u8) {
        assert!(table::contains(&registry.users, user), E_NOT_REGISTERED);
        let role = *table::borrow(&registry.users, user);
        assert!(role >= min_role, E_INSUFFICIENT_ROLE);
    }

    fun assert_subscription(store: &SubscriptionStore, user: address, required_tier: u8, clock: &Clock) {
        assert!(table::contains(&store.user_subscriptions, user), E_NO_SUBSCRIPTION);
        let sub = table::borrow(&store.user_subscriptions, user);
        assert!(sub.expires_at > clock.timestamp_ms(), E_SUBSCRIPTION_EXPIRED);
        assert!(sub.tier >= required_tier, E_SUBSCRIPTION_TIER_TOO_LOW);
    }

    fun assert_not_expired(sub: &Subscription, clock: &Clock) {
        assert!(sub.expires_at > clock.timestamp_ms(), E_SUBSCRIPTION_EXPIRED);
    }

    fun assert_escrow_party(escrow: &Escrow, addr: address) {
        assert!(
            addr == escrow.buyer || addr == escrow.seller || addr == escrow.arbitrator,
            E_NOT_ESCROW_PARTY,
        );
    }

    fun has_voted(votes: &vector<address>, addr: address): bool {
        let len = votes.length();
        let mut i = 0;
        while (i < len) {
            if (*votes.borrow(i) == addr) {
                return true
            };
            i = i + 1;
        };
        false
    }

    fun ensure_reputation(marketplace: &mut MarketplaceStore, user: address) {
        if (!table::contains(&marketplace.reputations, user)) {
            table::add(&mut marketplace.reputations, user, UserReputation {
                total_trades: 0,
                successful: 0,
                disputes_won: 0,
                disputes_lost: 0,
                total_volume: 0,
                rating_sum: 0,
                rating_count: 0,
            });
        };
    }

    // ══════════════════════════════════════════════════════════════════
    // ── REGISTRATION ─────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    public entry fun register(
        registry: &mut UserRegistry,
        entity_id: vector<u8>,
        data: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert!(!table::contains(&registry.users, sender), E_ALREADY_REGISTERED);

        table::add(&mut registry.users, sender, ROLE_USER);
        registry.user_count = registry.user_count + 1;

        event::emit(ForumEvent {
            tag: string::utf8(b"FORUM_USER"),
            entity_id: string::utf8(entity_id),
            data,
            version: 1,
            author: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // ── FORUM EVENTS ─────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    public entry fun post_event(
        forum: &mut Forum,
        registry: &UserRegistry,
        tag: vector<u8>,
        entity_id: vector<u8>,
        data: vector<u8>,
        version: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_active_user(registry, sender);
        forum.event_count = forum.event_count + 1;
        event::emit(ForumEvent {
            tag: string::utf8(tag),
            entity_id: string::utf8(entity_id),
            data,
            version,
            author: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun mod_post_event(
        forum: &mut Forum,
        registry: &UserRegistry,
        tag: vector<u8>,
        entity_id: vector<u8>,
        data: vector<u8>,
        version: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_min_role(registry, sender, ROLE_MODERATOR);
        forum.event_count = forum.event_count + 1;
        event::emit(ForumEvent {
            tag: string::utf8(tag),
            entity_id: string::utf8(entity_id),
            data,
            version,
            author: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun admin_post_event(
        forum: &mut Forum,
        registry: &UserRegistry,
        tag: vector<u8>,
        entity_id: vector<u8>,
        data: vector<u8>,
        version: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_min_role(registry, sender, ROLE_ADMIN);
        forum.event_count = forum.event_count + 1;
        event::emit(ForumEvent {
            tag: string::utf8(tag),
            entity_id: string::utf8(entity_id),
            data,
            version,
            author: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // ── ROLES ────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    public entry fun set_user_role(
        registry: &mut UserRegistry,
        target: address,
        new_role: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_min_role(registry, sender, ROLE_MODERATOR);
        assert!(sender != target, E_CANNOT_CHANGE_OWN_ROLE);
        assert!(table::contains(&registry.users, target), E_TARGET_NOT_REGISTERED);

        let sender_role = *table::borrow(&registry.users, sender);
        assert!(new_role <= sender_role, E_CANNOT_PROMOTE_ABOVE_SELF);
        let target_role = *table::borrow(&registry.users, target);
        assert!(target_role < sender_role, E_INSUFFICIENT_ROLE);

        let old_role = table::remove(&mut registry.users, target);
        table::add(&mut registry.users, target, new_role);

        event::emit(RoleChanged {
            user: target,
            old_role,
            new_role,
            changed_by: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun transfer_admin(cap: AdminCap, new_admin: address) {
        transfer::transfer(cap, new_admin);
    }

    // ══════════════════════════════════════════════════════════════════
    // ── TIP ──────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    public entry fun tip(
        registry: &UserRegistry,
        post_id: vector<u8>,
        payment: Coin<IOTA>,
        recipient: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_active_user(registry, sender);
        assert!(sender != recipient, E_CANNOT_TIP_SELF);
        assert!(coin::value(&payment) > 0, E_ZERO_AMOUNT);

        let amount = coin::value(&payment);
        transfer::public_transfer(payment, recipient);

        event::emit(TipEvent {
            from: sender,
            to: recipient,
            post_id: string::utf8(post_id),
            amount,
            timestamp: clock.timestamp_ms(),
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // ── SUBSCRIPTIONS ────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    public entry fun configure_tier(
        store: &mut SubscriptionStore,
        _cap: &AdminCap,
        tier_id: u8,
        price: u64,
        duration_ms: u64,
        features: u64,
    ) {
        let tier = SubscriptionTier { price, duration_ms, features };
        if (table::contains(&store.tiers, tier_id)) {
            let existing = table::borrow_mut(&mut store.tiers, tier_id);
            *existing = tier;
        } else {
            table::add(&mut store.tiers, tier_id, tier);
        };
    }

    public entry fun subscribe(
        registry: &UserRegistry,
        store: &mut SubscriptionStore,
        treasury: &mut Treasury,
        tier_id: u8,
        payment: Coin<IOTA>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_active_user(registry, sender);
        assert!(table::contains(&store.tiers, tier_id), E_TIER_NOT_FOUND);

        let tier = *table::borrow(&store.tiers, tier_id);
        assert!(coin::value(&payment) >= tier.price, E_INSUFFICIENT_PAYMENT);

        let mut payment_balance = coin::into_balance(payment);
        let exact = balance::split(&mut payment_balance, tier.price);
        balance::join(&mut treasury.balance, exact);
        if (balance::value(&payment_balance) > 0) {
            transfer::public_transfer(coin::from_balance(payment_balance, ctx), sender);
        } else {
            balance::destroy_zero(payment_balance);
        };

        let now = clock.timestamp_ms();
        let expires_at = now + tier.duration_ms;

        let sub = Subscription { tier: tier_id, expires_at };
        if (table::contains(&store.user_subscriptions, sender)) {
            let existing = table::borrow_mut(&mut store.user_subscriptions, sender);
            *existing = sub;
        } else {
            table::add(&mut store.user_subscriptions, sender, sub);
        };

        event::emit(SubscriptionEvent {
            user: sender,
            tier: tier_id,
            expires_at,
            timestamp: now,
        });
    }

    public entry fun renew_subscription(
        registry: &UserRegistry,
        store: &mut SubscriptionStore,
        treasury: &mut Treasury,
        payment: Coin<IOTA>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_active_user(registry, sender);
        assert!(table::contains(&store.user_subscriptions, sender), E_NO_SUBSCRIPTION);

        let sub = *table::borrow(&store.user_subscriptions, sender);
        let tier_id = sub.tier;
        assert!(table::contains(&store.tiers, tier_id), E_TIER_NOT_FOUND);

        let tier = *table::borrow(&store.tiers, tier_id);
        assert!(coin::value(&payment) >= tier.price, E_INSUFFICIENT_PAYMENT);

        let mut payment_balance = coin::into_balance(payment);
        let exact = balance::split(&mut payment_balance, tier.price);
        balance::join(&mut treasury.balance, exact);
        if (balance::value(&payment_balance) > 0) {
            transfer::public_transfer(coin::from_balance(payment_balance, ctx), sender);
        } else {
            balance::destroy_zero(payment_balance);
        };

        let now = clock.timestamp_ms();
        let base = if (sub.expires_at > now) { sub.expires_at } else { now };
        let new_expires = base + tier.duration_ms;

        let existing = table::borrow_mut(&mut store.user_subscriptions, sender);
        existing.expires_at = new_expires;

        event::emit(SubscriptionEvent {
            user: sender,
            tier: tier_id,
            expires_at: new_expires,
            timestamp: now,
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // ── MARKETPLACE ──────────────────────────────────════════════════
    // ══════════════════════════════════════════════════════════════════

    public entry fun create_paid_content(
        forum: &mut Forum,
        registry: &UserRegistry,
        marketplace: &mut MarketplaceStore,
        content_id: vector<u8>,
        price: u64,
        tag: vector<u8>,
        entity_id: vector<u8>,
        data: vector<u8>,
        version: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_active_user(registry, sender);
        assert!(price > 0, E_ZERO_AMOUNT);

        let content_id_str = string::utf8(content_id);
        assert!(!table::contains(&marketplace.paid_contents, content_id_str), E_CONTENT_ALREADY_EXISTS);

        table::add(&mut marketplace.paid_contents, content_id_str, PaidContent {
            author: sender,
            price,
            buyers: table::new(ctx),
        });

        forum.event_count = forum.event_count + 1;

        event::emit(ForumEvent {
            tag: string::utf8(tag),
            entity_id: string::utf8(entity_id),
            data,
            version,
            author: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun purchase_content(
        registry: &UserRegistry,
        marketplace: &mut MarketplaceStore,
        treasury: &mut Treasury,
        content_id: vector<u8>,
        payment: Coin<IOTA>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_active_user(registry, sender);

        let content_id_str = string::utf8(content_id);
        assert!(table::contains(&marketplace.paid_contents, content_id_str), E_CONTENT_NOT_FOUND);

        let content = table::borrow_mut(&mut marketplace.paid_contents, content_id_str);
        assert!(sender != content.author, E_OWN_CONTENT);
        assert!(!table::contains(&content.buyers, sender), E_ALREADY_PURCHASED);
        assert!(coin::value(&payment) >= content.price, E_INSUFFICIENT_PAYMENT);

        let author = content.author;
        let price = content.price;

        table::add(&mut content.buyers, sender, true);

        let mut payment_balance = coin::into_balance(payment);
        let fee_amount = price / MARKETPLACE_FEE_DIVISOR;
        let fee_balance = balance::split(&mut payment_balance, fee_amount);
        balance::join(&mut treasury.balance, fee_balance);

        let author_coin = coin::from_balance(payment_balance, ctx);
        transfer::public_transfer(author_coin, author);

        let now = clock.timestamp_ms();
        event::emit(PurchaseEvent {
            buyer: sender,
            content_id: content_id_str,
            author,
            amount: price,
            fee: fee_amount,
            timestamp: now,
        });
    }

    public entry fun configure_badge(
        marketplace: &mut MarketplaceStore,
        _cap: &AdminCap,
        badge_id: u8,
        name: vector<u8>,
        price: u64,
    ) {
        let badge = Badge { name: string::utf8(name), price };
        if (table::contains(&marketplace.badges, badge_id)) {
            let existing = table::borrow_mut(&mut marketplace.badges, badge_id);
            *existing = badge;
        } else {
            table::add(&mut marketplace.badges, badge_id, badge);
        };
    }

    public entry fun purchase_badge(
        registry: &UserRegistry,
        marketplace: &mut MarketplaceStore,
        treasury: &mut Treasury,
        badge_id: u8,
        payment: Coin<IOTA>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_active_user(registry, sender);
        assert!(table::contains(&marketplace.badges, badge_id), E_BADGE_NOT_FOUND);

        let badge = *table::borrow(&marketplace.badges, badge_id);
        assert!(coin::value(&payment) >= badge.price, E_INSUFFICIENT_PAYMENT);

        let mut payment_balance = coin::into_balance(payment);
        let exact = balance::split(&mut payment_balance, badge.price);
        balance::join(&mut treasury.balance, exact);
        if (balance::value(&payment_balance) > 0) {
            transfer::public_transfer(coin::from_balance(payment_balance, ctx), sender);
        } else {
            balance::destroy_zero(payment_balance);
        };

        if (!table::contains(&marketplace.user_badges, sender)) {
            table::add(&mut marketplace.user_badges, sender, vector::empty<u8>());
        };
        let user_badges = table::borrow_mut(&mut marketplace.user_badges, sender);

        let len = user_badges.length();
        let mut i = 0;
        let mut already_has = false;
        while (i < len) {
            if (*user_badges.borrow(i) == badge_id) {
                already_has = true;
                break
            };
            i = i + 1;
        };
        assert!(!already_has, E_ALREADY_HAS_BADGE);

        user_badges.push_back(badge_id);

        event::emit(BadgeEvent {
            user: sender,
            badge_id,
            timestamp: clock.timestamp_ms(),
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // ── ESCROW ───────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    public entry fun create_escrow(
        registry: &UserRegistry,
        seller: address,
        arbitrator: address,
        description: vector<u8>,
        deadline: u64,
        payment: Coin<IOTA>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let buyer = ctx.sender();
        assert_active_user(registry, buyer);
        assert!(table::contains(&registry.users, seller), E_TARGET_NOT_REGISTERED);
        assert!(table::contains(&registry.users, arbitrator), E_TARGET_NOT_REGISTERED);
        assert!(buyer != seller, E_CANNOT_BE_OWN_SELLER);
        assert!(buyer != arbitrator, E_CANNOT_BE_OWN_ARBITRATOR);
        assert!(seller != arbitrator, E_SELLER_CANNOT_BE_ARBITRATOR);
        assert!(coin::value(&payment) > 0, E_ZERO_AMOUNT);
        assert!(deadline > clock.timestamp_ms(), E_DEADLINE_IN_PAST);

        let amount = coin::value(&payment);
        let escrow_balance = coin::into_balance(payment);

        let escrow = Escrow {
            id: object::new(ctx),
            buyer,
            seller,
            arbitrator,
            amount,
            description: string::utf8(description),
            deadline,
            status: ESCROW_CREATED,
            release_votes: vector::empty(),
            refund_votes: vector::empty(),
            rated_by: vector::empty(),
            balance: escrow_balance,
        };

        let escrow_id = object::id(&escrow);

        event::emit(EscrowCreated {
            escrow_id,
            buyer,
            seller,
            arbitrator,
            amount,
            deadline,
            timestamp: clock.timestamp_ms(),
        });

        transfer::share_object(escrow);
    }

    public entry fun mark_delivered(
        escrow: &mut Escrow,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert!(sender == escrow.seller, E_ONLY_SELLER);
        assert!(escrow.status == ESCROW_CREATED, E_ESCROW_WRONG_STATUS);
        assert!(clock.timestamp_ms() <= escrow.deadline, E_ESCROW_EXPIRED);

        escrow.status = ESCROW_DELIVERED;

        event::emit(EscrowUpdated {
            escrow_id: object::id(escrow),
            action: string::utf8(b"delivered"),
            actor: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun open_dispute(
        escrow: &mut Escrow,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert!(sender == escrow.buyer, E_ONLY_BUYER);
        assert!(
            escrow.status == ESCROW_CREATED || escrow.status == ESCROW_DELIVERED,
            E_ESCROW_WRONG_STATUS,
        );
        assert!(clock.timestamp_ms() <= escrow.deadline, E_ESCROW_EXPIRED);

        escrow.status = ESCROW_DISPUTED;

        event::emit(EscrowUpdated {
            escrow_id: object::id(escrow),
            action: string::utf8(b"disputed"),
            actor: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun vote_release(
        escrow: &mut Escrow,
        marketplace: &mut MarketplaceStore,
        treasury: &mut Treasury,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_escrow_party(escrow, sender);
        assert!(escrow.status != ESCROW_RESOLVED, E_ESCROW_WRONG_STATUS);
        assert!(!has_voted(&escrow.release_votes, sender), E_ALREADY_VOTED);
        assert!(!has_voted(&escrow.refund_votes, sender), E_ALREADY_VOTED);

        escrow.release_votes.push_back(sender);

        event::emit(EscrowUpdated {
            escrow_id: object::id(escrow),
            action: string::utf8(b"vote_release"),
            actor: sender,
            timestamp: clock.timestamp_ms(),
        });

        if (escrow.release_votes.length() >= VOTES_REQUIRED) {
            escrow.status = ESCROW_RESOLVED;

            let total = balance::value(&escrow.balance);
            let fee_amount = total / ESCROW_FEE_DIVISOR;
            let fee_balance = balance::split(&mut escrow.balance, fee_amount);
            balance::join(&mut treasury.balance, fee_balance);

            let seller_balance = balance::withdraw_all(&mut escrow.balance);
            let seller_coin = coin::from_balance(seller_balance, ctx);
            transfer::public_transfer(seller_coin, escrow.seller);

            ensure_reputation(marketplace, escrow.buyer);
            ensure_reputation(marketplace, escrow.seller);
            let buyer_rep = table::borrow_mut(&mut marketplace.reputations, escrow.buyer);
            buyer_rep.total_trades = buyer_rep.total_trades + 1;
            buyer_rep.successful = buyer_rep.successful + 1;
            buyer_rep.total_volume = buyer_rep.total_volume + escrow.amount;

            let seller_rep = table::borrow_mut(&mut marketplace.reputations, escrow.seller);
            seller_rep.total_trades = seller_rep.total_trades + 1;
            seller_rep.successful = seller_rep.successful + 1;
            seller_rep.total_volume = seller_rep.total_volume + escrow.amount;

            event::emit(EscrowUpdated {
                escrow_id: object::id(escrow),
                action: string::utf8(b"released"),
                actor: sender,
                timestamp: clock.timestamp_ms(),
            });
        };
    }

    public entry fun vote_refund(
        escrow: &mut Escrow,
        marketplace: &mut MarketplaceStore,
        treasury: &mut Treasury,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_escrow_party(escrow, sender);
        assert!(escrow.status != ESCROW_RESOLVED, E_ESCROW_WRONG_STATUS);
        assert!(!has_voted(&escrow.refund_votes, sender), E_ALREADY_VOTED);
        assert!(!has_voted(&escrow.release_votes, sender), E_ALREADY_VOTED);

        escrow.refund_votes.push_back(sender);

        event::emit(EscrowUpdated {
            escrow_id: object::id(escrow),
            action: string::utf8(b"vote_refund"),
            actor: sender,
            timestamp: clock.timestamp_ms(),
        });

        if (escrow.refund_votes.length() >= VOTES_REQUIRED) {
            escrow.status = ESCROW_RESOLVED;

            let total = balance::value(&escrow.balance);
            let fee_amount = total / ESCROW_FEE_DIVISOR;
            let fee_balance = balance::split(&mut escrow.balance, fee_amount);
            balance::join(&mut treasury.balance, fee_balance);

            let buyer_balance = balance::withdraw_all(&mut escrow.balance);
            let buyer_coin = coin::from_balance(buyer_balance, ctx);
            transfer::public_transfer(buyer_coin, escrow.buyer);

            ensure_reputation(marketplace, escrow.buyer);
            ensure_reputation(marketplace, escrow.seller);
            let buyer_rep = table::borrow_mut(&mut marketplace.reputations, escrow.buyer);
            buyer_rep.total_trades = buyer_rep.total_trades + 1;
            buyer_rep.disputes_won = buyer_rep.disputes_won + 1;
            buyer_rep.total_volume = buyer_rep.total_volume + escrow.amount;

            let seller_rep = table::borrow_mut(&mut marketplace.reputations, escrow.seller);
            seller_rep.total_trades = seller_rep.total_trades + 1;
            seller_rep.disputes_lost = seller_rep.disputes_lost + 1;
            seller_rep.total_volume = seller_rep.total_volume + escrow.amount;

            event::emit(EscrowUpdated {
                escrow_id: object::id(escrow),
                action: string::utf8(b"refunded"),
                actor: sender,
                timestamp: clock.timestamp_ms(),
            });
        };
    }

    public entry fun rate_trade(
        escrow: &mut Escrow,
        marketplace: &mut MarketplaceStore,
        rated: address,
        score: u8,
        comment: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert!(escrow.status == ESCROW_RESOLVED, E_ESCROW_NOT_RESOLVED);
        assert!(
            sender == escrow.buyer || sender == escrow.seller,
            E_NOT_ESCROW_PARTY,
        );
        assert!(sender != rated, E_CANNOT_RATE_SELF);
        assert!(
            rated == escrow.buyer || rated == escrow.seller,
            E_NOT_ESCROW_PARTY,
        );
        assert!(score >= 1 && score <= 5, E_INVALID_RATING);
        assert!(!has_voted(&escrow.rated_by, sender), E_ALREADY_RATED);
        escrow.rated_by.push_back(sender);

        ensure_reputation(marketplace, rated);
        let rep = table::borrow_mut(&mut marketplace.reputations, rated);
        rep.rating_sum = rep.rating_sum + (score as u64);
        rep.rating_count = rep.rating_count + 1;

        event::emit(RatingEvent {
            escrow_id: object::id(escrow),
            rater: sender,
            rated,
            score,
            comment: string::utf8(comment),
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun claim_expired(
        escrow: &mut Escrow,
        marketplace: &mut MarketplaceStore,
        treasury: &mut Treasury,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert!(sender == escrow.buyer, E_ONLY_BUYER);
        assert!(clock.timestamp_ms() > escrow.deadline, E_NOT_EXPIRED);
        assert!(escrow.status != ESCROW_RESOLVED, E_ALREADY_RESOLVED);

        escrow.status = ESCROW_RESOLVED;

        let total = balance::value(&escrow.balance);
        let fee_amount = total / ESCROW_FEE_DIVISOR;
        let fee_balance = balance::split(&mut escrow.balance, fee_amount);
        balance::join(&mut treasury.balance, fee_balance);

        let buyer_balance = balance::withdraw_all(&mut escrow.balance);
        let buyer_coin = coin::from_balance(buyer_balance, ctx);
        transfer::public_transfer(buyer_coin, escrow.buyer);

        ensure_reputation(marketplace, escrow.buyer);
        ensure_reputation(marketplace, escrow.seller);
        let buyer_rep = table::borrow_mut(&mut marketplace.reputations, escrow.buyer);
        buyer_rep.total_trades = buyer_rep.total_trades + 1;
        buyer_rep.total_volume = buyer_rep.total_volume + escrow.amount;

        let seller_rep = table::borrow_mut(&mut marketplace.reputations, escrow.seller);
        seller_rep.total_trades = seller_rep.total_trades + 1;
        seller_rep.disputes_lost = seller_rep.disputes_lost + 1;
        seller_rep.total_volume = seller_rep.total_volume + escrow.amount;

        event::emit(EscrowUpdated {
            escrow_id: object::id(escrow),
            action: string::utf8(b"expired_refund"),
            actor: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // ── SOCIAL GRAPH: FOLLOW / UNFOLLOW ──────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    public entry fun follow(
        registry: &mut UserRegistry,
        target: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_active_user(registry, sender);
        assert!(table::contains(&registry.users, target), E_TARGET_NOT_REGISTERED);
        assert!(sender != target, E_CANNOT_FOLLOW_SELF);

        if (!table::contains(&registry.follows, sender)) {
            table::add(&mut registry.follows, sender, vector::empty<address>());
        };
        let following = table::borrow_mut(&mut registry.follows, sender);

        // Check not already following
        let len = following.length();
        let mut i = 0;
        while (i < len) {
            assert!(*following.borrow(i) != target, E_ALREADY_FOLLOWING);
            i = i + 1;
        };

        following.push_back(target);

        event::emit(ForumEvent {
            tag: string::utf8(b"FORUM_FOLLOW"),
            entity_id: string::utf8(b""),
            data: vector::empty(),
            version: 1,
            author: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun unfollow(
        registry: &mut UserRegistry,
        target: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_active_user(registry, sender);
        assert!(table::contains(&registry.follows, sender), E_NOT_FOLLOWING);

        let following = table::borrow_mut(&mut registry.follows, sender);
        let len = following.length();
        let mut i = 0;
        let mut found = false;
        while (i < len) {
            if (*following.borrow(i) == target) {
                following.swap_remove(i);
                found = true;
                break
            };
            i = i + 1;
        };
        assert!(found, E_NOT_FOLLOWING);

        event::emit(ForumEvent {
            tag: string::utf8(b"FORUM_UNFOLLOW"),
            entity_id: string::utf8(b""),
            data: vector::empty(),
            version: 1,
            author: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // ── GOVERNANCE: POLLS ────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    public entry fun create_poll(
        governance: &mut GovernanceStore,
        registry: &UserRegistry,
        poll_id: vector<u8>,
        options_count: u8,
        deadline: u64,
        data: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_active_user(registry, sender);
        assert!(deadline > clock.timestamp_ms(), E_DEADLINE_IN_PAST);
        assert!(options_count >= 2, E_INVALID_OPTION);

        let poll_id_str = string::utf8(poll_id);
        assert!(!table::contains(&governance.polls, poll_id_str), E_POLL_ALREADY_EXISTS);

        table::add(&mut governance.polls, poll_id_str, Poll {
            creator: sender,
            options_count,
            votes: table::new(ctx),
            deadline,
            closed: false,
        });

        event::emit(ForumEvent {
            tag: string::utf8(b"FORUM_POLL"),
            entity_id: poll_id_str,
            data,
            version: 1,
            author: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun vote_poll(
        governance: &mut GovernanceStore,
        registry: &UserRegistry,
        poll_id: vector<u8>,
        option: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_active_user(registry, sender);

        let poll_id_str = string::utf8(poll_id);
        assert!(table::contains(&governance.polls, poll_id_str), E_POLL_NOT_FOUND);

        let poll = table::borrow_mut(&mut governance.polls, poll_id_str);
        assert!(!poll.closed, E_POLL_CLOSED);
        assert!(clock.timestamp_ms() <= poll.deadline, E_POLL_EXPIRED);
        assert!(option < poll.options_count, E_INVALID_OPTION);
        assert!(!table::contains(&poll.votes, sender), E_POLL_ALREADY_VOTED);

        table::add(&mut poll.votes, sender, option);

        event::emit(ForumEvent {
            tag: string::utf8(b"FORUM_POLL_VOTE"),
            entity_id: poll_id_str,
            data: vector::empty(),
            version: 1,
            author: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun close_poll(
        governance: &mut GovernanceStore,
        registry: &UserRegistry,
        poll_id: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        let poll_id_str = string::utf8(poll_id);
        assert!(table::contains(&governance.polls, poll_id_str), E_POLL_NOT_FOUND);

        let poll = table::borrow_mut(&mut governance.polls, poll_id_str);
        assert!(!poll.closed, E_POLL_CLOSED);

        // Only creator or admin can close
        let is_creator = sender == poll.creator;
        let is_admin = table::contains(&registry.users, sender) &&
            *table::borrow(&registry.users, sender) >= ROLE_ADMIN;
        assert!(is_creator || is_admin, E_NOT_POLL_CREATOR_OR_ADMIN);

        poll.closed = true;

        event::emit(ForumEvent {
            tag: string::utf8(b"FORUM_POLL"),
            entity_id: poll_id_str,
            data: vector::empty(),
            version: 2,
            author: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // ── GOVERNANCE: PROPOSALS ────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    public entry fun create_proposal(
        governance: &mut GovernanceStore,
        registry: &UserRegistry,
        proposal_id: vector<u8>,
        quorum: u64,
        deadline: u64,
        data: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_active_user(registry, sender);
        assert!(deadline > clock.timestamp_ms(), E_DEADLINE_IN_PAST);
        assert!(quorum > 0, E_ZERO_AMOUNT);

        let proposal_id_str = string::utf8(proposal_id);
        assert!(!table::contains(&governance.proposals, proposal_id_str), E_PROPOSAL_ALREADY_EXISTS);

        table::add(&mut governance.proposals, proposal_id_str, Proposal {
            creator: sender,
            quorum,
            yes_votes: vector::empty(),
            no_votes: vector::empty(),
            deadline,
            status: PROPOSAL_ACTIVE,
        });

        event::emit(ForumEvent {
            tag: string::utf8(b"FORUM_PROPOSAL"),
            entity_id: proposal_id_str,
            data,
            version: 1,
            author: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun vote_proposal(
        governance: &mut GovernanceStore,
        registry: &UserRegistry,
        proposal_id: vector<u8>,
        vote_yes: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_active_user(registry, sender);

        let proposal_id_str = string::utf8(proposal_id);
        assert!(table::contains(&governance.proposals, proposal_id_str), E_PROPOSAL_NOT_FOUND);

        let proposal = table::borrow_mut(&mut governance.proposals, proposal_id_str);
        assert!(proposal.status == PROPOSAL_ACTIVE, E_PROPOSAL_CLOSED);
        assert!(clock.timestamp_ms() <= proposal.deadline, E_PROPOSAL_EXPIRED);
        assert!(!has_voted(&proposal.yes_votes, sender), E_PROPOSAL_ALREADY_VOTED);
        assert!(!has_voted(&proposal.no_votes, sender), E_PROPOSAL_ALREADY_VOTED);

        if (vote_yes) {
            proposal.yes_votes.push_back(sender);
        } else {
            proposal.no_votes.push_back(sender);
        };

        event::emit(ForumEvent {
            tag: string::utf8(b"FORUM_PROPOSAL_VOTE"),
            entity_id: proposal_id_str,
            data: vector::empty(),
            version: 1,
            author: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun close_proposal(
        governance: &mut GovernanceStore,
        registry: &UserRegistry,
        proposal_id: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        let proposal_id_str = string::utf8(proposal_id);
        assert!(table::contains(&governance.proposals, proposal_id_str), E_PROPOSAL_NOT_FOUND);

        let proposal = table::borrow_mut(&mut governance.proposals, proposal_id_str);
        assert!(proposal.status == PROPOSAL_ACTIVE, E_PROPOSAL_CLOSED);

        // Only creator or admin can close
        let is_creator = sender == proposal.creator;
        let is_admin = table::contains(&registry.users, sender) &&
            *table::borrow(&registry.users, sender) >= ROLE_ADMIN;
        assert!(is_creator || is_admin, E_NOT_PROPOSAL_CREATOR_OR_ADMIN);

        let total_votes = proposal.yes_votes.length() + proposal.no_votes.length();
        if (total_votes >= proposal.quorum && proposal.yes_votes.length() > proposal.no_votes.length()) {
            proposal.status = PROPOSAL_PASSED;
        } else if (clock.timestamp_ms() > proposal.deadline) {
            if (total_votes >= proposal.quorum && proposal.yes_votes.length() > proposal.no_votes.length()) {
                proposal.status = PROPOSAL_PASSED;
            } else {
                proposal.status = PROPOSAL_EXPIRED;
            };
        } else {
            proposal.status = PROPOSAL_REJECTED;
        };

        event::emit(ForumEvent {
            tag: string::utf8(b"FORUM_PROPOSAL"),
            entity_id: proposal_id_str,
            data: vector::empty(),
            version: 2,
            author: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // ── ADMIN: TREASURY ──────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    public entry fun withdraw_funds(
        treasury: &mut Treasury,
        _cap: &AdminCap,
        amount: u64,
        ctx: &mut TxContext,
    ) {
        assert!(amount > 0, E_ZERO_AMOUNT);
        assert!(balance::value(&treasury.balance) >= amount, E_INSUFFICIENT_TREASURY);

        let withdrawn = balance::split(&mut treasury.balance, amount);
        let coin = coin::from_balance(withdrawn, ctx);
        transfer::public_transfer(coin, ctx.sender());
    }

    // ── View functions ──────────────────────────────────────────────

    public fun event_count(forum: &Forum): u64 { forum.event_count }
    public fun user_count(registry: &UserRegistry): u64 { registry.user_count }
    public fun admin(forum: &Forum): address { forum.admin }

    public fun is_registered(registry: &UserRegistry, user: address): bool {
        table::contains(&registry.users, user)
    }

    public fun user_role(registry: &UserRegistry, user: address): u8 {
        get_role(registry, user)
    }

    public fun treasury_balance(treasury: &Treasury): u64 {
        balance::value(&treasury.balance)
    }

    public fun has_subscription(store: &SubscriptionStore, user: address): bool {
        table::contains(&store.user_subscriptions, user)
    }

    public fun escrow_status(escrow: &Escrow): u8 {
        escrow.status
    }

    public fun escrow_amount(escrow: &Escrow): u64 {
        escrow.amount
    }

    // ── Test-only helpers ──────────────────────────────────────────

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
