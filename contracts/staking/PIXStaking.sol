//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "../interfaces/IPIX.sol";

contract PIXStaking is OwnableUpgradeable, ReentrancyGuardUpgradeable, ERC721HolderUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    event StakedPixNFT(uint256 tokenId, address indexed recipient);
    event WithdrawnPixNFT(uint256 tokenId, address indexed recipient);
    event ClaimPixNFT(uint256 pending, address indexed recipient);
    event RewardAdded(uint256 reward);

    struct UserInfo {
        mapping(uint256 => bool) isStaked;
        uint256 rewardDebt;
        uint256 tiers;
    }

    mapping(address => UserInfo) public userInfo;
    mapping(uint256 => uint256) public tierInfo;

    IERC20Upgradeable public rewardToken;

    address public pixNFT;
    uint256 public totalTiers;

    uint256 public constant DURATION = 10 days;
    uint256 public periodFinish;
    uint256 public rewardRate;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTierStored;
    address public rewardDistributor;
    mapping(address => uint256) public userRewardPerTierPaid;
    mapping(address => uint256) public rewards;

    modifier updateReward(address account) {
        rewardPerTierStored = rewardPerTier();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTierPaid[account] = rewardPerTierStored;
        }
        _;
    }

    modifier onlyRewardDistributor() {
        require(msg.sender == rewardDistributor, "Staking: NON_DISTRIBUTOR");
        _;
    }

    function initialize(address _pixt, address _pixNFT) external initializer {
        require(_pixt != address(0), "Staking: INVALID_PIXT");
        require(_pixNFT != address(0), "Staking: INVALID_PIX");
        rewardToken = IERC20Upgradeable(_pixt);
        pixNFT = _pixNFT;
        __Ownable_init();
        __ReentrancyGuard_init();
        __ERC721Holder_init();
    }

    /// @dev validation reward period
    function lastTimeRewardApplicable() public view returns (uint256) {
        return MathUpgradeable.min(block.timestamp, periodFinish);
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
     * @param account target user address
     */
    function earned(address account) public view returns (uint256) {
        return
            (userInfo[account].tiers * (rewardPerTier() - userRewardPerTierPaid[account])) /
            1e18 +
            rewards[account];
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

    function stake(uint256 _tokenId) external updateReward(msg.sender) {
        require(_tokenId > 0, "Staking: INVALID_TOKEN_ID");
        require(tierInfo[_tokenId] > 0, "Staking: INVALID_TIER");
        require(IPIX(pixNFT).isTerritory(_tokenId), "Staking: TERRITORY_ONLY");

        UserInfo storage user = userInfo[msg.sender];

        uint256 tiers = tierInfo[_tokenId];

        IERC721Upgradeable(pixNFT).safeTransferFrom(msg.sender, address(this), _tokenId);
        totalTiers = totalTiers.add(tiers);

        // Update User Info
        user.tiers = user.tiers.add(tiers);
        user.isStaked[_tokenId] = true;

        emit StakedPixNFT(_tokenId, address(this));
    }

    function withdraw(uint256 _tokenId) external updateReward(msg.sender) nonReentrant {
        require(_tokenId > 0, "Staking: INVALID_TOKEN_ID");
        UserInfo storage user = userInfo[msg.sender];
        require(user.tiers > 0, "Staking: NO_WITHDRAWALS");
        require(user.isStaked[_tokenId], "Staking: NO_STAKES");

        IERC721Upgradeable(pixNFT).safeTransferFrom(address(this), msg.sender, _tokenId);
        totalTiers = totalTiers.sub(tierInfo[_tokenId]);
        // Update UserInfo
        user.tiers = user.tiers.sub(tierInfo[_tokenId]);
        user.isStaked[_tokenId] = false;

        emit WithdrawnPixNFT(_tokenId, msg.sender);
    }

    /**
     * @dev claim reward and update reward related arguments
     * @notice emit {RewardPaid} event
     */
    function claim() public updateReward(msg.sender) {
        uint256 reward = earned(msg.sender);
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardToken.safeTransfer(msg.sender, reward);
            emit ClaimPixNFT(reward, msg.sender);
        }
    }

    /**
     * @dev update reward related arguments after reward token arrived
     * @param reward reward token amounts received
     * @notice emit {RewardAdded} event
     */
    function notifyRewardAmount(uint256 reward)
        external
        onlyRewardDistributor
        updateReward(address(0))
    {
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

    function setTierInfo(uint256 _tokenId, uint256 _tier) external onlyOwner {
        require(_tier > 0, "Staking: INVALID_TIERS");
        tierInfo[_tokenId] = _tier;
    }
}
