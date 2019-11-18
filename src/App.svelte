<script>
    import nahmii from 'nahmii-sdk';
    import {ethers} from 'ethers';
    import Web3 from 'web3';
    import DataTable, {Head, Body, Row, Cell} from '@smui/data-table';
    import Button, {Label} from '@smui/button';
    import LinearProgress from '@smui/linear-progress';
    import Textfield, {Input} from '@smui/textfield';
    import FloatingLabel from '@smui/floating-label';
    import LineRipple from '@smui/line-ripple';
    import Snackbar from '@smui/snackbar';

    let provider;
    let wallet = {};
    let web3Account = {};
    let balances = {baseLayer: {}, nahmii: {}};
    let depositing = false;
    let depositAmount;
    let depositHash = '';
    let payAmount;
    let recipientAddress;
    let settling = false;
    let settleHash = '';
    let withdrawing = false;
    let withdrawHash = '';
    let ongoingSettlements = [];
    let stageableSettlements = [];
    let tokenInfo = {};
    let syncInterval;
    let snackbar;
    let snackMsg = '';
    const gasLimit = 3000000;
    const gasPrice = 2000000000;

    async function getProvider() {
        const appId = '5dca9097d6bebe0012cb39ad';
        const secret = '$2a$10$xoT4JWb19a4WndsmW0iE/ur1F2qkYxEN.rfZYHXWv/TW9POM6oj/6';
        return await nahmii.NahmiiProvider.from('api2.dev.hubii.net/', appId, secret);
    }

    async function createWallet(provider, privateKey) {
        const web3 = new Web3(provider.connection.url);
        if (privateKey) {
            web3Account = web3.eth.accounts.privateKeyToAccount(privateKey);
        }
        else {
            web3Account = web3.eth.accounts.create();
            window.localStorage.setItem('private-key', web3Account.privateKey);
        }
        const senderSigner = getSigner(web3Account);
        wallet = new nahmii.Wallet(senderSigner, provider);
        syncInterval = sync(wallet);
        return wallet;
    }

    async function createNewWallet() {
        return createWallet(provider, null);
    }

    function getSigner(account) {
        return {
            signMessage: async (msg) => {
                const {signature} = await account.sign.call(this, msg);
                return signature;
            },
            signTransaction: async (tx) => {
                const {chainId, gasLimit, gasPrice, nonce, to, value, data} = tx;
                const signedTx = await account.signTransaction.call(this, {
                    chainId,
                    nonce,
                    to,
                    value,
                    data,
                    gasPrice,
                    gas: gasLimit
                });
                return signedTx.rawTransaction;
            },
            address: account.address
        };
    }

    async function getBalances(wallet) {
        const ethBalance = await wallet.getBalance();
        const TT1Contract = await nahmii.Erc20Contract.from(tokenInfo.symbol, wallet);
        const tt1Balance = await TT1Contract.balanceOf(wallet.address);
        
        return {
            baseLayer: {
                ETH: ethers.utils.formatEther(ethBalance),
                TT1: ethers.utils.formatUnits(tt1Balance, tokenInfo.decimals)
            },
            nahmii: await wallet.getNahmiiBalance()
        };
    }

    async function deposit() {
        depositing = true;
        try {
            const pendingApprovalTx = await wallet.approveTokenDeposit(depositAmount, tokenInfo.symbol);
            depositHash = pendingApprovalTx.hash;
            await provider.getTransactionConfirmation(depositHash);

            const pendingCompleteTx = await wallet.completeTokenDeposit(depositAmount, tokenInfo.symbol);
            depositHash = pendingCompleteTx.hash;
            await provider.getTransactionConfirmation(depositHash);
        }
        catch (error) {
            snackMsg = error.message;
            snackbar.open();
        }
        finally {
            depositing = false;
            depositHash = '';
        }
    }

    async function transfer() {
        try {
            const payMonetaryAmount = nahmii.MonetaryAmount.from({
                currency: {
                    ct: tokenInfo.currency,
                    id: '0'
                },
                amount: ethers.utils.parseUnits(payAmount, tokenInfo.decimals)
            });
            const payment = new nahmii.Payment(payMonetaryAmount, wallet.address, recipientAddress, wallet);
            await payment.sign();
            await payment.register();
            snackMsg = `Successfully transferred ${payAmount} ${tokenInfo.symbol} to ${recipientAddress} via nahmii`;
            snackbar.open();
        }
        catch (error) {
            snackMsg = error.message;
            snackbar.open();
        }
    }

    async function getSettlements(wallet) {
        const settlementFactory = new nahmii.SettlementFactory(wallet.provider);
        return await settlementFactory.getAllSettlements(wallet.address, tokenInfo.currency);
    }

    async function settle() {
        try {
            settling = true;
            const settlementFactory = new nahmii.SettlementFactory(provider);
            const stageMonetaryAmount = nahmii.MonetaryAmount.from(
                ethers.utils.parseUnits(balances.nahmii.TT1, tokenInfo.decimals), 
                tokenInfo.currency
            );
            const settlements = await settlementFactory.calculateRequiredSettlements(wallet.address, stageMonetaryAmount);
            for (const settlement of settlements) {
                const {hash} = await settlement.start(wallet, {gasLimit, gasPrice});
                settleHash = hash;
                await provider.getTransactionConfirmation(hash);
            }
        }
        catch (error) {
            snackMsg = error.message;
            snackbar.open();
        }
        finally {
            settling = false;
        }
    }

    async function withdraw() {
        try {
            withdrawing = true;
            for(const settlement of stageableSettlements) {
                const {hash} = await settlement.stage(wallet, {gasLimit, gasPrice});
                withdrawHash = hash;
                await provider.getTransactionConfirmation(hash);
            }
            const stagedBalanceBN = await wallet.getNahmiiStagedBalance(tokenInfo.symbol);
            const withdrawMonetaryAmount = nahmii.MonetaryAmount.from(stagedBalanceBN, tokenInfo.currency);
            const {hash} = await wallet.withdraw(withdrawMonetaryAmount, {gasLimit, gasPrice});
            withdrawHash = hash;
            await provider.getTransactionConfirmation(hash);

            withdrawHash = hash;
        }
        catch (error) {
            snackMsg = error.message;
            snackbar.open();
        }
        finally {
            withdrawing = false;
        }
    }

    function sync(wallet) {
        if (syncInterval) 
            clearInterval(syncInterval);
        
        return setInterval(async () => {
            balances = await getBalances(wallet);
            const settlements = await getSettlements(wallet);
            ongoingSettlements = settlements.filter(s => s.isOngoing);
            stageableSettlements = settlements.filter(s => s.isStageable);
        }, 5000);
    }

    async function init() {
        provider = await getProvider();
        wallet = await createWallet(provider, window.localStorage.getItem('private-key'));
        tokenInfo = await provider.getTokenInfo('TT1');
    }

    init();
</script>

<div class="container">
    <h1>nahmii payment demo</h1>
    <section class="container">
        <h3>Wallet [Ropsten]</h3>
        <div class="row">
            <div class="margins">
                Wallet address: {wallet.address}
            </div>
            <div class="margins">
                Private key: {web3Account.privateKey}
            </div>
        </div>
        <div class="row margins">
            <Button on:click={createNewWallet} variant="raised">
                <Label>Generate new wallet</Label>
            </Button>
        </div>
    </section>
    <section class="container">
        <h3>Base layer</h3>
        <div class="margins">
            In order to do some tests on this web app, you will need to send some ETH to the wallet above. <br> 
            Then send some ETH from the wallet to "0x0fa211adf6f6d506cde88abf6832d226f7db73ad" to mint some TT1 on Ropsten.
        </div>
        <DataTable table$aria-label="Balances on base layer" class="col-12">
            <Head>
                <Row>
                    <Cell>Currency</Cell>
                    <Cell>Balance</Cell>
                </Row>
            </Head>

            <Body>
                {#each Object.keys(balances.baseLayer) as currency}
                    <Row>
                        <Cell>{currency}</Cell>
                        <Cell numeric>{balances.baseLayer[currency]}</Cell>
                    </Row>
                {/each}
            </Body>
        </DataTable>
    </section>
    <section class="container">
    <!-- deposit -->
        {#if depositing}
            <div>
                Confirming transaction: <a target="_blank" href="https://ropsten.etherscan.io/tx/{depositHash}">{depositHash}</a>
                <LinearProgress indeterminate />
            </div>
        {:else}
            <div>
                <Textfield>
                    <Input bind:value={depositAmount} id="deposit-amount-input" />
                    <FloatingLabel for="deposit-amount-input">Amount</FloatingLabel>
                    <LineRipple />
                </Textfield>
                <Button on:click={deposit} variant="raised" disabled={!depositAmount}>
                    <Label>Deposit TT1</Label>
                </Button>
            </div>
        {/if}
    </section>
    <section class="container">
    <!-- nahmii balances -->
        <h3>nahmii 2nd layer</h3>
        <DataTable table$aria-label="nahmii balances" class="col-12">
            <Head>
                <Row>
                    <Cell>Currency</Cell>
                    <Cell>Balance</Cell>
                </Row>
            </Head>

            <Body>
                {#each Object.keys(balances.nahmii) as currency}
                    <Row>
                        <Cell>{currency}</Cell>
                        <Cell numeric>{balances.nahmii[currency]}</Cell>
                    </Row>
                {/each}
            </Body>
        </DataTable>
    </section>
    <section class="container">
    <!-- pay form -->
        <div class="row">
            <Textfield class="col-10 col-sm-12">
                <Input bind:value={recipientAddress} id="recipient-address-input" />
                <FloatingLabel for="recipient-address-input">Recipient Address</FloatingLabel>
                <LineRipple />
            </Textfield>
        </div>
        <div class="row">
            <Textfield>
                <Input bind:value={payAmount} id="pay-amount-input" />
                <FloatingLabel for="pay-amount-input">Amount</FloatingLabel>
                <LineRipple />
            </Textfield>
            <Button on:click={transfer} variant="raised" disabled={!payAmount}>
                <Label>Transfer TT1</Label>
            </Button>
        </div>
    </section>
    <section class="container margins">
    <!-- settlement/withdrawal -->
        <h3>Settlement</h3>
        <div>
            {#if stageableSettlements.length > 0}
                <div>
                    There are {stageableSettlements.length} settlement(s) qualified and ready for withdrawal.
                </div>
                {#if withdrawing}
                    <div>
                        Confirming transaction: <a target="_blank" href="https://ropsten.etherscan.io/tx/{withdrawHash}">{withdrawHash}</a>
                        <LinearProgress indeterminate />
                    </div>
                {:else}
                    <div>
                        <Button on:click={withdraw} variant="raised">
                            <Label>Withdraw TT1</Label>
                        </Button>
                    </div>
                {/if}
            {:else if ongoingSettlements.length > 0}
                <div>
                    There are {ongoingSettlements.length} ongoing settlement(s). <br>
                    The expiration time for the challenge period will be {new Date(ongoingSettlements[0].expirationTime).toISOString()}
                </div>
            {:else}
                {#if settling}
                    <div>
                        Confirming transaction: <a target="_blank" href="https://ropsten.etherscan.io/tx/{settleHash}">{settleHash}</a>
                        <LinearProgress indeterminate />
                    </div>
                {:else}
                    <div>
                        <Button on:click={settle} variant="raised">
                            <Label>Settle TT1</Label>
                        </Button>
                    </div>
                {/if}
            {/if}
        </div>
    </section>
</div>
<Snackbar bind:this={snackbar} labelText={snackMsg}>
    <Label></Label>
</Snackbar>
