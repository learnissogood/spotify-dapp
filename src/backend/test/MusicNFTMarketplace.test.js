//We don't have to import waffle and mocha because hardhat injects them automatically
//Importing chai assertion library
const { expect } = require("chai");
const { ethers } = require("hardhat");

const toWei = (num) => ethers.utils.parseEther(num.toString());
const fromWei = (num) => ethers.utils.formatEther(num);

describe("MusicNFTMarketplace", function () {

    let nftMarketplace;
    let deployer, artist, user1, user2, users;
    let royaltyFee = toWei(0.01);
    let URI = "https://bafybeidhjjbjonyqcahuzlpt7sznmh4xrlbspa3gstop5o47l6gsiaffee.ipfs.nftstorage.link/";
    let prices = [toWei(1), toWei(2), toWei(3), toWei(4), toWei(5), toWei(6), toWei(7), toWei(8)];
    let deploymentFees = toWei(prices.length * 0.01);

    beforeEach(async function () {
        //Get the ContractFactory and Signers here
        const MusicNFTMarketplaceFactory = await ethers.getContractFactory("MusicNFTMarketplace");
        [deployer, artist, user1, user2, ...users] = await ethers.getSigners();

        //Deploy MusicNFTMarketplace contract
        nftMarketplace = await MusicNFTMarketplaceFactory.deploy(
            royaltyFee,
            artist.address,
            prices,
            { value: deploymentFees }
        );
    });

    describe("Deployment", function () {
        it("Sould track name, symbol, URI, royaltyFee and artist address", async function () {
            const nftName = "DAppiFy";
            const nftSymbol = "FY";
            expect(await nftMarketplace.name()).to.equal(nftName);
            expect(await nftMarketplace.symbol()).to.equal(nftSymbol);
            expect(await nftMarketplace.baseURI()).to.equal(URI);
            expect(await nftMarketplace.royaltyFee()).to.equal(royaltyFee);
            expect(await nftMarketplace.artist()).to.equal(artist.address);
        });

        it("Sould mint then list all the music nfts", async function () {
            expect(await nftMarketplace.balanceOf(nftMarketplace.address)).to.equal(8);
            //Get each item from the marketItems array then check fields to ensure they are correct
            await Promise.all(prices.map(async (i, indx) => {
                const item = await nftMarketplace.marketItems(indx);
                expect(item.tokenId).to.equal(indx);
                expect(item.seller).to.equal(deployer.address);
                expect(item.price).to.equal(i);
            }))
        });

        it("Ether balance of the contract shoul equal deployments fees", async function () {
            expect(await ethers.provider.getBalance(nftMarketplace.address)).to.equal(deploymentFees);
        });
    });

    describe("Updating royalty fee", function () {
        it("Only deployer sould be able to update royaltyFee", async function () {
            //creating a variable that contains the new royaltyFee price
            const newFee = toWei(0.02);
            await nftMarketplace.updateRoyaltyFee(newFee);
            await expect(
                nftMarketplace.connect(user1).updateRoyaltyFee(newFee)
            ).to.be.revertedWith("Ownable: caller is not the owner");
            expect(await nftMarketplace.royaltyFee()).to.equal(newFee);
        });
    });

    describe("Buying tokens", function () {
        it("Should update seller to zero address, transfer NFT, pay seller, pay royaltyFee to the artist and emit a MarketItemBought event", async function () {
            //First we need to know the balance of the deployer wich is the owner of the NFTs and the balance of the artist wich will receive the royaltyFee
            const deployerInitialEthBal = await deployer.getBalance();
            const artistInitialEthBal = await artist.getBalance();
            //User1 purchase item
            await expect(nftMarketplace.connect(user1).buyToken(0, { value: prices[0] }))
            .to.emit(nftMarketplace, "MarketItemBought")
            .withArgs(
                0,
                deployer.address,
                user1.address,
                prices[0]
            );
            const deployerFinalEthBal = await deployer.getBalance();
            const artistFinalEthBal = await artist.getBalance();
            //Item seller should be zero addr
            expect((await nftMarketplace.marketItems(0)).seller).to.equal("0x0000000000000000000000000000000000000000");
            //Seller should receive payment for the price of the NFT sold
            expect(+fromWei(deployerFinalEthBal)).to.equal(+fromWei(prices[0]) + +fromWei(deployerInitialEthBal));
            //Artist should receive the royaltyFee
            expect(+fromWei(artistFinalEthBal)).to.equal(+fromWei(royaltyFee) + +fromWei(artistInitialEthBal));
            //The buyer should now own the NFT
            expect(await nftMarketplace.ownerOf(0)).to.equal(user1.address);
        });

        it("Should fail when ether amount sent with transaction dous not equal asking price", async function () {
            //Fails when ether sent does not equal asking price
            await expect(
                nftMarketplace.connect(user1).buyToken(0, { value: prices[1] })
            ).to.be.revertedWith("Please send the asking price in order to complete the purchase");
        });
    });

    describe("Reselling Tokens", function () {
        beforeEach(async function () {
            //User1 purchase an item
            await nftMarketplace.connect(user1).buyToken(0, { value: prices[0] });
        });

        it("Should track resale item, incr. ether bal by royaltyFee, transfer NFT to marketplace and emit MarketItemRelisted event", async function () {
            const resalePrice = toWei(2);
            const initialMarketBal = await ethers.provider.getBalance(nftMarketplace.address);
            //User1 lists the NFT for a price of 2 hoping to flip it and double ther money
            await expect(nftMarketplace.connect(user1).resellToken(0, resalePrice, { value: royaltyFee}))
            .to.emit(nftMarketplace, "MarketItemRelisted")
            .withArgs(
                0,
                user1.address,
                resalePrice
            )
            const finalMarketBal = await ethers.provider.getBalance(nftMarketplace.address);
            //Expect final market balance to equal initialBal + royaltyFee
            expect(+fromWei(finalMarketBal)).to.equal(+fromWei(initialMarketBal) + +fromWei(royaltyFee));
            //Expect owner of NFT should now be the marketplace
            expect(await nftMarketplace.ownerOf(0)).to.equal(nftMarketplace.address);
            //Checking fields of struct should be change
            const item = await nftMarketplace.marketItems(0);
            expect(item.tokenId).to.equal(0);
            expect(item.seller).to.equal(user1.address);
            expect(item.price).to.equal(resalePrice);
        });

        it("Should fail if price is set to zero and royaltyFee is not paid", async function () {
            await expect(
                nftMarketplace.connect(user1).resellToken(0, 0, { value: royaltyFee })
            ).to.be.revertedWith("Price must be greater than zero");
            await expect(
                nftMarketplace.connect(user1).resellToken(0, toWei(1), { value: 0 })
            ).to.be.revertedWith("Must pay royalty");
        });
    });

    describe("Getter functions", function () {
        let soldItems = [0, 1, 4];
        let ownedByUser1 = [0, 1];
        let ownedByUser2 = [4];
        beforeEach(async function () {
            // User 1 purchases item 0
            await (await nftMarketplace.connect(user1).buyToken(0, { value: prices[0] })).wait();
            // User 1 purchases item 1
            await (await nftMarketplace.connect(user1).buyToken(1, { value: prices[1] })).wait();
            // User 2 purchases item 4
            await (await nftMarketplace.connect(user2).buyToken(4, { value: prices[4] })).wait();
        });

        it("getAllUnsoldTokens should fetch all the marketplace items up for sale", async function (){
            const unsoldItems = await nftMarketplace.getAllUnsoldTokens();
            // Check to make sure that all the returned unsolItems have filtered out the sold items
            expect(unsoldItems.every(i => !soldItems.some(j => j === i.tokenId.toNumber()))).to.equal(true);
            // Check that the length is correct
            expect(unsoldItems.length === prices.length - soldItems.length).to.equal(true);
        });

        it("getMyTokens should fetch all tokens the user owns", async function (){
            // Get items owned by user1
            let myItems = await nftMarketplace.connect(user1).getMyTokens();
            // Check that the returned my items array is correct
            expect(myItems.every(i => ownedByUser1.some(j => j === i.tokenId.toNumber()))).to.equal(true);
            expect(ownedByUser1.length === myItems.length).to.equal(true);
            // Get items by user2
            myItems = await nftMarketplace.connect(user2).getMyTokens();
            // Check that the returned my items array is correct
            expect(myItems.every(i => ownedByUser2.some(j => j === i.tokenId.toNumber()))).to.equal(true);
            expect(ownedByUser2.length === myItems.length).to.equal(true);
        });
    });
})