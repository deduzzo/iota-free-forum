#[test_only]
module forum::forum_tests {
    use iota::test_scenario::{Self as ts, Scenario};
    use iota::clock::{Self, Clock};
    use iota::coin::{Self, Coin};
    use iota::iota::IOTA;
    use forum::forum::{Self, UserRegistry, Treasury, MarketplaceStore, GovernanceStore, Escrow};

    // ── Test addresses ─────────────────────────────────────────────
    const ADMIN: address = @0xAD;
    const USER1: address = @0x1;
    const USER2: address = @0x2;
    const USER3: address = @0x3; // arbitrator

    // ── Helper: init forum (calls module init) ─────────────────────
    fun setup_forum(scenario: &mut Scenario) {
        ts::next_tx(scenario, ADMIN);
        {
            forum::init_for_testing(ts::ctx(scenario));
        };
    }

    // ── Helper: create a clock with a given timestamp ──────────────
    fun create_clock(ts_ms: u64, ctx: &mut TxContext): Clock {
        let mut c = clock::create_for_testing(ctx);
        clock::set_for_testing(&mut c, ts_ms);
        c
    }

    // ── Helper: mint IOTA coins for testing ────────────────────────
    fun mint_iota(amount: u64, ctx: &mut TxContext): Coin<IOTA> {
        coin::mint_for_testing<IOTA>(amount, ctx)
    }

    // ── Helper: register a user ────────────────────────────────────
    fun register_user(scenario: &mut Scenario, user: address, clk: &Clock) {
        ts::next_tx(scenario, user);
        {
            let mut registry = ts::take_shared<UserRegistry>(scenario);
            forum::register(
                &mut registry,
                b"entity_1",
                b"data",
                clk,
                ts::ctx(scenario),
            );
            ts::return_shared(registry);
        };
    }

    // ══════════════════════════════════════════════════════════════════
    // ── TEST: REGISTRATION ───────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    #[test]
    fun test_register_user() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        // Create clock
        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        // Register USER1
        register_user(&mut scenario, USER1, &clk);

        // Verify user_count incremented (admin=1 at init + USER1=1 via register)
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            // init starts with user_count=1 (admin), register adds 1
            assert!(forum::user_count(&registry) == 2, 0);
            assert!(forum::is_registered(&registry, USER1), 1);
            assert!(forum::user_role(&registry, USER1) == 1, 2); // ROLE_USER
            ts::return_shared(registry);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 2)] // E_ALREADY_REGISTERED
    fun test_register_duplicate_fails() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        // Register USER1
        register_user(&mut scenario, USER1, &clk);

        // Try to register USER1 again — should abort
        ts::next_tx(&mut scenario, USER1);
        {
            let mut registry = ts::take_shared<UserRegistry>(&scenario);
            forum::register(
                &mut registry,
                b"entity_2",
                b"data2",
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    fun test_set_user_role() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        // Register USER1
        register_user(&mut scenario, USER1, &clk);

        // Admin sets USER1 role to MODERATOR (2)
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = ts::take_shared<UserRegistry>(&scenario);
            forum::set_user_role(
                &mut registry,
                USER1,
                2, // ROLE_MODERATOR
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
        };

        // Verify role changed
        ts::next_tx(&mut scenario, ADMIN);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            assert!(forum::user_role(&registry, USER1) == 2, 0);
            ts::return_shared(registry);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ══════════════════════════════════════════════════════════════════
    // ── TEST: ESCROW ─────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    // Helper: setup 3 registered users (ADMIN already registered by init)
    fun setup_three_users(scenario: &mut Scenario, clk: &Clock) {
        register_user(scenario, USER1, clk); // buyer
        register_user(scenario, USER2, clk); // seller
        register_user(scenario, USER3, clk); // arbitrator
    }

    // Helper: create escrow with USER1 as buyer
    fun create_test_escrow(
        scenario: &mut Scenario,
        clk: &Clock,
        amount: u64,
        deadline: u64,
    ) {
        ts::next_tx(scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(scenario);
            let payment = mint_iota(amount, ts::ctx(scenario));
            forum::create_escrow(
                &registry,
                USER2,       // seller
                USER3,       // arbitrator
                b"test escrow",
                deadline,
                payment,
                clk,
                ts::ctx(scenario),
            );
            ts::return_shared(registry);
        };
    }

    #[test]
    fun test_create_escrow() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        setup_three_users(&mut scenario, &clk);

        // Create escrow: USER1 (buyer), USER2 (seller), USER3 (arbitrator)
        create_test_escrow(&mut scenario, &clk, 1_000_000, 10_000);

        // Verify escrow fields
        ts::next_tx(&mut scenario, USER1);
        {
            let escrow = ts::take_shared<Escrow>(&scenario);
            assert!(forum::escrow_status(&escrow) == 0, 0); // ESCROW_CREATED
            assert!(forum::escrow_amount(&escrow) == 1_000_000, 1);
            ts::return_shared(escrow);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    fun test_mark_delivered() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        setup_three_users(&mut scenario, &clk);
        create_test_escrow(&mut scenario, &clk, 1_000_000, 10_000);

        // Seller marks delivered
        ts::next_tx(&mut scenario, USER2);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            forum::mark_delivered(&mut escrow, &clk, ts::ctx(&mut scenario));
            assert!(forum::escrow_status(&escrow) == 1, 0); // ESCROW_DELIVERED
            ts::return_shared(escrow);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    fun test_vote_release() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        setup_three_users(&mut scenario, &clk);
        create_test_escrow(&mut scenario, &clk, 1_000_000, 10_000);

        // Buyer votes release
        ts::next_tx(&mut scenario, USER1);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            let mut marketplace = ts::take_shared<MarketplaceStore>(&scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            forum::vote_release(&mut escrow, &mut marketplace, &mut treasury, &clk, ts::ctx(&mut scenario));
            // Only 1 vote so far, not resolved yet
            assert!(forum::escrow_status(&escrow) == 0, 0); // still CREATED
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
            ts::return_shared(treasury);
        };

        // Arbitrator votes release — now 2 votes, should resolve
        ts::next_tx(&mut scenario, USER3);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            let mut marketplace = ts::take_shared<MarketplaceStore>(&scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            forum::vote_release(&mut escrow, &mut marketplace, &mut treasury, &clk, ts::ctx(&mut scenario));
            assert!(forum::escrow_status(&escrow) == 3, 0); // ESCROW_RESOLVED
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
            ts::return_shared(treasury);
        };

        // Verify treasury got the 2% fee: 1_000_000 / 50 = 20_000
        ts::next_tx(&mut scenario, ADMIN);
        {
            let treasury = ts::take_shared<Treasury>(&scenario);
            assert!(forum::treasury_balance(&treasury) == 20_000, 0);
            ts::return_shared(treasury);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    fun test_vote_refund() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        setup_three_users(&mut scenario, &clk);
        create_test_escrow(&mut scenario, &clk, 1_000_000, 10_000);

        // Buyer votes refund
        ts::next_tx(&mut scenario, USER1);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            let mut marketplace = ts::take_shared<MarketplaceStore>(&scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            forum::vote_refund(&mut escrow, &mut marketplace, &mut treasury, &clk, ts::ctx(&mut scenario));
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
            ts::return_shared(treasury);
        };

        // Arbitrator votes refund — resolves
        ts::next_tx(&mut scenario, USER3);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            let mut marketplace = ts::take_shared<MarketplaceStore>(&scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            forum::vote_refund(&mut escrow, &mut marketplace, &mut treasury, &clk, ts::ctx(&mut scenario));
            assert!(forum::escrow_status(&escrow) == 3, 0); // RESOLVED
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
            ts::return_shared(treasury);
        };

        // Treasury got 2% fee
        ts::next_tx(&mut scenario, ADMIN);
        {
            let treasury = ts::take_shared<Treasury>(&scenario);
            assert!(forum::treasury_balance(&treasury) == 20_000, 0);
            ts::return_shared(treasury);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ══════════════════════════════════════════════════════════════════
    // ── TEST: CLAIM EXPIRED ESCROW ───────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    #[test]
    fun test_claim_expired() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let mut clk = create_clock(1000, ts::ctx(&mut scenario));

        setup_three_users(&mut scenario, &clk);
        create_test_escrow(&mut scenario, &clk, 1_000_000, 5_000); // deadline at 5000ms

        // Advance clock past deadline
        clock::set_for_testing(&mut clk, 6_000);

        // Buyer claims expired escrow
        ts::next_tx(&mut scenario, USER1);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            let mut marketplace = ts::take_shared<MarketplaceStore>(&scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            forum::claim_expired(&mut escrow, &mut marketplace, &mut treasury, &clk, ts::ctx(&mut scenario));
            assert!(forum::escrow_status(&escrow) == 3, 0); // RESOLVED
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
            ts::return_shared(treasury);
        };

        // Treasury got 2% fee
        ts::next_tx(&mut scenario, ADMIN);
        {
            let treasury = ts::take_shared<Treasury>(&scenario);
            assert!(forum::treasury_balance(&treasury) == 20_000, 0);
            ts::return_shared(treasury);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 36)] // E_NOT_EXPIRED
    fun test_claim_expired_before_deadline_fails() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        setup_three_users(&mut scenario, &clk);
        create_test_escrow(&mut scenario, &clk, 1_000_000, 5_000);

        // Try to claim BEFORE deadline (clock is still at 1000, deadline is 5000)
        ts::next_tx(&mut scenario, USER1);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            let mut marketplace = ts::take_shared<MarketplaceStore>(&scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            forum::claim_expired(&mut escrow, &mut marketplace, &mut treasury, &clk, ts::ctx(&mut scenario));
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
            ts::return_shared(treasury);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 37)] // E_ALREADY_RESOLVED
    fun test_claim_expired_already_resolved_fails() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let mut clk = create_clock(1000, ts::ctx(&mut scenario));

        setup_three_users(&mut scenario, &clk);
        create_test_escrow(&mut scenario, &clk, 1_000_000, 5_000);

        // Resolve escrow via vote_release (buyer + arbitrator)
        ts::next_tx(&mut scenario, USER1);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            let mut marketplace = ts::take_shared<MarketplaceStore>(&scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            forum::vote_release(&mut escrow, &mut marketplace, &mut treasury, &clk, ts::ctx(&mut scenario));
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
            ts::return_shared(treasury);
        };
        ts::next_tx(&mut scenario, USER3);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            let mut marketplace = ts::take_shared<MarketplaceStore>(&scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            forum::vote_release(&mut escrow, &mut marketplace, &mut treasury, &clk, ts::ctx(&mut scenario));
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
            ts::return_shared(treasury);
        };

        // Advance clock past deadline
        clock::set_for_testing(&mut clk, 6_000);

        // Try to claim expired on already resolved escrow — should abort
        ts::next_tx(&mut scenario, USER1);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            let mut marketplace = ts::take_shared<MarketplaceStore>(&scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            forum::claim_expired(&mut escrow, &mut marketplace, &mut treasury, &clk, ts::ctx(&mut scenario));
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
            ts::return_shared(treasury);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ══════════════════════════════════════════════════════════════════
    // ── TEST: RATE TRADE ─────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    // Helper: create and resolve escrow (via release)
    fun create_and_resolve_escrow(scenario: &mut Scenario, clk: &Clock) {
        create_test_escrow(scenario, clk, 1_000_000, 10_000);

        // Buyer votes release
        ts::next_tx(scenario, USER1);
        {
            let mut escrow = ts::take_shared<Escrow>(scenario);
            let mut marketplace = ts::take_shared<MarketplaceStore>(scenario);
            let mut treasury = ts::take_shared<Treasury>(scenario);
            forum::vote_release(&mut escrow, &mut marketplace, &mut treasury, clk, ts::ctx(scenario));
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
            ts::return_shared(treasury);
        };

        // Arbitrator votes release — resolves
        ts::next_tx(scenario, USER3);
        {
            let mut escrow = ts::take_shared<Escrow>(scenario);
            let mut marketplace = ts::take_shared<MarketplaceStore>(scenario);
            let mut treasury = ts::take_shared<Treasury>(scenario);
            forum::vote_release(&mut escrow, &mut marketplace, &mut treasury, clk, ts::ctx(scenario));
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
            ts::return_shared(treasury);
        };
    }

    #[test]
    #[expected_failure(abort_code = 35)] // E_ALREADY_RATED
    fun test_rate_trade_prevents_double_rating() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        setup_three_users(&mut scenario, &clk);
        create_and_resolve_escrow(&mut scenario, &clk);

        // Buyer rates seller (first time — OK)
        ts::next_tx(&mut scenario, USER1);
        {
            let mut marketplace = ts::take_shared<MarketplaceStore>(&scenario);
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            forum::rate_trade(
                &mut escrow,
                &mut marketplace,
                USER2, // rated = seller
                5,
                b"great",
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
        };

        // Buyer rates seller again — should abort with E_ALREADY_RATED
        ts::next_tx(&mut scenario, USER1);
        {
            let mut marketplace = ts::take_shared<MarketplaceStore>(&scenario);
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            forum::rate_trade(
                &mut escrow,
                &mut marketplace,
                USER2,
                4,
                b"duplicate",
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    fun test_rate_trade_different_users_ok() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        setup_three_users(&mut scenario, &clk);
        create_and_resolve_escrow(&mut scenario, &clk);

        // Buyer rates seller
        ts::next_tx(&mut scenario, USER1);
        {
            let mut marketplace = ts::take_shared<MarketplaceStore>(&scenario);
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            forum::rate_trade(
                &mut escrow,
                &mut marketplace,
                USER2,
                5,
                b"excellent seller",
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
        };

        // Seller rates buyer — different user, should be OK
        ts::next_tx(&mut scenario, USER2);
        {
            let mut marketplace = ts::take_shared<MarketplaceStore>(&scenario);
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            forum::rate_trade(
                &mut escrow,
                &mut marketplace,
                USER1,
                4,
                b"good buyer",
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(escrow);
            ts::return_shared(marketplace);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ══════════════════════════════════════════════════════════════════
    // ── TEST: TIP ────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    #[test]
    fun test_tip_basic() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        register_user(&mut scenario, USER1, &clk);
        register_user(&mut scenario, USER2, &clk);

        // USER1 tips USER2 with 500_000
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let payment = mint_iota(500_000, ts::ctx(&mut scenario));
            forum::tip(
                &registry,
                b"post_123",
                payment,
                USER2,
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
        };

        // Verify USER2 received the coin
        ts::next_tx(&mut scenario, USER2);
        {
            let coin = ts::take_from_address<Coin<IOTA>>(&scenario, USER2);
            assert!(coin::value(&coin) == 500_000, 0);
            ts::return_to_address(USER2, coin);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 23)] // E_CANNOT_TIP_SELF
    fun test_tip_self_fails() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        register_user(&mut scenario, USER1, &clk);

        // USER1 tries to tip themselves — should abort
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let payment = mint_iota(100_000, ts::ctx(&mut scenario));
            forum::tip(
                &registry,
                b"post_1",
                payment,
                USER1, // self!
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 24)] // E_ZERO_AMOUNT
    fun test_tip_zero_fails() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        register_user(&mut scenario, USER1, &clk);
        register_user(&mut scenario, USER2, &clk);

        // USER1 tips USER2 with 0 amount — should abort
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let payment = mint_iota(0, ts::ctx(&mut scenario));
            forum::tip(
                &registry,
                b"post_1",
                payment,
                USER2,
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ══════════════════════════════════════════════════════════════════
    // ── TEST: FOLLOW / UNFOLLOW ──────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    #[test]
    fun test_follow_and_unfollow() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        register_user(&mut scenario, USER1, &clk);
        register_user(&mut scenario, USER2, &clk);

        // USER1 follows USER2
        ts::next_tx(&mut scenario, USER1);
        {
            let mut registry = ts::take_shared<UserRegistry>(&scenario);
            forum::follow(&mut registry, USER2, &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
        };

        // USER1 unfollows USER2
        ts::next_tx(&mut scenario, USER1);
        {
            let mut registry = ts::take_shared<UserRegistry>(&scenario);
            forum::unfollow(&mut registry, USER2, &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 38)] // E_CANNOT_FOLLOW_SELF
    fun test_follow_self_fails() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        register_user(&mut scenario, USER1, &clk);

        ts::next_tx(&mut scenario, USER1);
        {
            let mut registry = ts::take_shared<UserRegistry>(&scenario);
            forum::follow(&mut registry, USER1, &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 39)] // E_ALREADY_FOLLOWING
    fun test_follow_duplicate_fails() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        register_user(&mut scenario, USER1, &clk);
        register_user(&mut scenario, USER2, &clk);

        // Follow once
        ts::next_tx(&mut scenario, USER1);
        {
            let mut registry = ts::take_shared<UserRegistry>(&scenario);
            forum::follow(&mut registry, USER2, &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
        };

        // Follow again — should abort
        ts::next_tx(&mut scenario, USER1);
        {
            let mut registry = ts::take_shared<UserRegistry>(&scenario);
            forum::follow(&mut registry, USER2, &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 40)] // E_NOT_FOLLOWING
    fun test_unfollow_not_following_fails() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        register_user(&mut scenario, USER1, &clk);
        register_user(&mut scenario, USER2, &clk);

        // Unfollow without following first — should abort
        ts::next_tx(&mut scenario, USER1);
        {
            let mut registry = ts::take_shared<UserRegistry>(&scenario);
            forum::unfollow(&mut registry, USER2, &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ══════════════════════════════════════════════════════════════════
    // ── TEST: POLLS ──────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    #[test]
    fun test_create_and_vote_poll() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        register_user(&mut scenario, USER1, &clk);
        register_user(&mut scenario, USER2, &clk);

        // USER1 creates a poll with 3 options, deadline at 10000
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::create_poll(
                &mut governance,
                &registry,
                b"poll_1",
                3,
                10_000,
                b"Which feature next?",
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        // USER1 votes option 0
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::vote_poll(
                &mut governance,
                &registry,
                b"poll_1",
                0,
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        // USER2 votes option 2
        ts::next_tx(&mut scenario, USER2);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::vote_poll(
                &mut governance,
                &registry,
                b"poll_1",
                2,
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 44)] // E_POLL_ALREADY_VOTED
    fun test_poll_double_vote_fails() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        register_user(&mut scenario, USER1, &clk);

        // Create poll
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::create_poll(
                &mut governance,
                &registry,
                b"poll_1",
                3,
                10_000,
                b"data",
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        // Vote once
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::vote_poll(&mut governance, &registry, b"poll_1", 0, &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        // Vote again — should abort
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::vote_poll(&mut governance, &registry, b"poll_1", 1, &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    fun test_close_poll() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        register_user(&mut scenario, USER1, &clk);

        // Create poll
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::create_poll(
                &mut governance,
                &registry,
                b"poll_1",
                2,
                10_000,
                b"data",
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        // Creator closes poll
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::close_poll(&mut governance, &registry, b"poll_1", &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    // ══════════════════════════════════════════════════════════════════
    // ── TEST: PROPOSALS ──────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════

    #[test]
    fun test_create_and_vote_proposal() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        register_user(&mut scenario, USER1, &clk);
        register_user(&mut scenario, USER2, &clk);

        // USER1 creates proposal with quorum=2
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::create_proposal(
                &mut governance,
                &registry,
                b"prop_1",
                2,
                10_000,
                b"Add new feature X",
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        // USER1 votes yes
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::vote_proposal(&mut governance, &registry, b"prop_1", true, &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        // USER2 votes yes
        ts::next_tx(&mut scenario, USER2);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::vote_proposal(&mut governance, &registry, b"prop_1", true, &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        // Creator closes proposal — should pass (quorum met, majority yes)
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::close_proposal(&mut governance, &registry, b"prop_1", &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 50)] // E_PROPOSAL_ALREADY_VOTED
    fun test_proposal_double_vote_fails() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        register_user(&mut scenario, USER1, &clk);

        // Create proposal
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::create_proposal(
                &mut governance,
                &registry,
                b"prop_1",
                1,
                10_000,
                b"data",
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        // Vote once
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::vote_proposal(&mut governance, &registry, b"prop_1", true, &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        // Vote again — should abort
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::vote_proposal(&mut governance, &registry, b"prop_1", false, &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }

    #[test]
    fun test_proposal_rejected() {
        let mut scenario = ts::begin(ADMIN);
        setup_forum(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        let clk = create_clock(1000, ts::ctx(&mut scenario));

        register_user(&mut scenario, USER1, &clk);
        register_user(&mut scenario, USER2, &clk);

        // Create proposal with quorum=2
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::create_proposal(
                &mut governance,
                &registry,
                b"prop_rej",
                2,
                10_000,
                b"bad idea",
                &clk,
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        // USER1 votes no, USER2 votes no
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::vote_proposal(&mut governance, &registry, b"prop_rej", false, &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
            ts::return_shared(governance);
        };
        ts::next_tx(&mut scenario, USER2);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::vote_proposal(&mut governance, &registry, b"prop_rej", false, &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        // Close — should be rejected (quorum met but no majority yes)
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<UserRegistry>(&scenario);
            let mut governance = ts::take_shared<GovernanceStore>(&scenario);
            forum::close_proposal(&mut governance, &registry, b"prop_rej", &clk, ts::ctx(&mut scenario));
            ts::return_shared(registry);
            ts::return_shared(governance);
        };

        clock::destroy_for_testing(clk);
        ts::end(scenario);
    }
}
