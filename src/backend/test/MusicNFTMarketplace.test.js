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
})