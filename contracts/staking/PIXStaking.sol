//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../interfaces/IPIX.sol";

contract PIXStaking is OwnableUpgradeable, ReentrancyGuardUpgradeable, ERC721HolderUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    event PIXStaked(uint256 tokenId, address indexed account);
    event PIXUnstaked(uint256 tokenId, address indexed account);
    event RewardClaimed(uint256 reward, address indexed account);
    event RewardAdded(uint256 reward);

    mapping(uint256 => address) public stakers;
    mapping(address => uint256[]) public stakedNFTs;

    IERC20Upgradeable public rewardToken;

    address public pixNFT;
    uint256 public totalTiers;

    uint256 public constant DURATION = 10 days;
    uint256 public periodFinish;
    uint256 public rewardRate;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTierStored;
    address public rewardDistributor;
    mapping(uint256 => uint256) public nftRewardPerTierPaid;
    mapping(uint256 => uint256) public rewards;

    modifier onlyRewardDistributor() {
        require(msg.sender == rewardDistributor, "Staking: NON_DISTRIBUTOR");
        _;
    }

    function initialize(address _pixt, address _pixNFT) external initializer {
        require(_pixt != address(0), "Staking: INVALID_PIXT");
        require(_pixNFT != address(0), "Staking: INVALID_PIX");
        __Ownable_init();
        __ReentrancyGuard_init();
        __ERC721Holder_init();

        rewardToken = IERC20Upgradeable(_pixt);
        pixNFT = _pixNFT;
    }

    /// @dev validation reward period
    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    /// @dev reward rate per staked token
    function rewardPerTier() public view returns (uint256) {
        if (totalTiers == 0) {
            return rewardPerTierStored;
        }
        return
            rewardPerTierStored +
            ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18) /
            totalTiers;
    }

    /**
     * @dev view total stacked reward for user
     * @param tokenId target tokenId
     */
    function earned(uint256 tokenId) public view returns (uint256) {
        uint256 tier = stakers[tokenId] != address(0) ? IPIX(pixNFT).getTier(tokenId) : 0;
        return (tier * (rewardPerTier() - nftRewardPerTierPaid[tokenId])) / 1e18 + rewards[tokenId];
    }

    function earnedBatch(uint256[] memory tokenIds) external view returns (uint256[] memory) {
        uint256[] memory earneds = new uint256[](tokenIds.length);
        for (uint256 i; i < tokenIds.length; i += 1) {
            earneds[i] = earned(tokenIds[i]);
        }
        return earneds;
    }

    function earnedByAccount(address account) public view returns (uint256 reward) {
        for (uint256 i; i < stakedNFTs[account].length; i += 1) {
            if (stakers[stakedNFTs[account][i]] == address(0)) continue;
            reward += earned(stakedNFTs[account][i]);
        }
    }

    /**
     * @dev set reward distributor by owner
     * reward distributor is the moderator who calls {notifyRewardAmount} function
     * whenever periodic reward tokens transferred to this contract
     * @param distributor new distributor address
     */
    function setRewardDistributor(address distributor) external onlyOwner {
        require(distributor != address(0), "Staking: INVALID_DISTRIBUTOR");
        rewardDistributor = distributor;
    }

    function stake(uint256 tokenId) external nonReentrant {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        _updateReward(tokenIds);

        uint256 tier = IPIX(pixNFT).getTier(tokenId);
        require(tokenId > 0, "Staking: INVALID_TOKEN_ID");
        require(tier > 0, "Staking: TIER_NOT_SET");
        require(IPIX(pixNFT).isTerritory(tokenId), "Staking: TERRITORY_ONLY");

        totalTiers += tier;
        stakers[tokenId] = msg.sender;
        stakedNFTs[msg.sender].push(tokenId);

        IERC721Upgradeable(pixNFT).safeTransferFrom(msg.sender, address(this), tokenId);
        emit PIXStaked(tokenId, msg.sender);
    }

    function unstake(uint256 tokenId) external nonReentrant {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        _updateReward(tokenIds);

        uint256 tier = IPIX(pixNFT).getTier(tokenId);
        require(tokenId > 0, "Staking: INVALID_TOKEN_ID");
        require(stakers[tokenId] == msg.sender, "Staking: NOT_STAKER");

        totalTiers -= tier;
        delete stakers[tokenId];

        uint256 reward = earned(tokenId);
        if (reward > 0) {
            rewards[tokenId] = 0;
            rewardToken.safeTransfer(msg.sender, reward);
            emit RewardClaimed(reward, msg.sender);
        }

        IERC721Upgradeable(pixNFT).safeTransferFrom(address(this), msg.sender, tokenId);
        emit PIXUnstaked(tokenId, msg.sender);
    }

    /**
     * @dev claim reward and update reward related arguments
     * @notice emit {RewardClaimed} event
     */
    function claimBatch(uint256[] memory tokenIds) public {
        _updateReward(tokenIds);

        uint256 reward;
        for (uint256 i; i < tokenIds.length; i += 1) {
            require(stakers[tokenIds[i]] == msg.sender, "Staking: NOT_STAKER");
            reward += earned(tokenIds[i]);
            rewards[tokenIds[i]] = 0;
        }
        if (reward > 0) {
            rewardToken.safeTransfer(msg.sender, reward);
            emit RewardClaimed(reward, msg.sender);
        }
    }

    function claim() external {
        uint256[] memory tokenIds = new uint256[](stakedNFTs[msg.sender].length);
        uint256 k;
        for (uint256 i; i < stakedNFTs[msg.sender].length; i += 1) {
            if (stakers[stakedNFTs[msg.sender][i]] == address(0)) continue;
            tokenIds[k++] = stakedNFTs[msg.sender][i];
        }
        claimBatch(tokenIds);
    }

    /**
     * @dev update reward related arguments after reward token arrived
     * @param reward reward token amounts received
     * @notice emit {RewardAdded} event
     */
    function notifyRewardAmount(uint256 reward) external onlyRewardDistributor {
        _updateReward(new uint256[](0));

        rewardToken.safeTransferFrom(msg.sender, address(this), reward);

        if (block.timestamp >= periodFinish) {
            rewardRate = reward / DURATION;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (reward + leftover) / DURATION;
        }
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + DURATION;
        emit RewardAdded(reward);
    }

    function isStaked(uint256 tokenId) external view returns (bool) {
        return stakers[tokenId] != address(0);
    }

    function _updateReward(uint256[] memory tokenIds) private {
        rewardPerTierStored = rewardPerTier();
        lastUpdateTime = lastTimeRewardApplicable();

        for (uint256 i; i < tokenIds.length; i += 1) {
            if (stakers[tokenIds[i]] != address(0)) {
                rewards[tokenIds[i]] = earned(tokenIds[i]);
                nftRewardPerTierPaid[tokenIds[i]] = rewardPerTierStored;
            }
        }
    }
}
