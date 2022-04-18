//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

contract PIXLandStaking is OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    event StakedPixNFT(uint256 tokenId, address indexed recipient);
    event WithdrawnPixNFT(uint256 tokenId, address indexed recipient);
    event ClaimPixNFT(uint256 pending, address indexed recipient);
    event RewardAdded(uint256 reward);

    mapping(uint256 => bool) public isStaked;
    mapping(address => uint256) public tiers;

    IERC20Upgradeable public rewardToken;

    address public pixLandmark;
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
        require(msg.sender == rewardDistributor, "LandStaking: NON_DISTRIBUTOR");
        _;
    }

    function initialize(address _pixt, address _pixLandmark) external initializer {
        require(_pixt != address(0), "LandStaking: INVALID_PIXT");
        require(_pixLandmark != address(0), "LandStaking: INVALID_PIX_LAND");

        __Ownable_init();
        __ReentrancyGuard_init();

        rewardToken = IERC20Upgradeable(_pixt);
        pixLandmark = _pixLandmark;
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
     * @param account target user address
     */
    function earned(address account) public view returns (uint256) {
        return
            (tiers[account] * (rewardPerTier() - userRewardPerTierPaid[account])) /
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
        require(distributor != address(0), "LandStaking: INVALID_DISTRIBUTOR");
        rewardDistributor = distributor;
    }

    function stake(uint256 _tokenId) external updateReward(msg.sender) nonReentrant {
        require(_tokenId > 0, "LandStaking: INVALID_TOKEN_ID");

        isStaked[_tokenId] = true;

        emit StakedPixNFT(_tokenId, address(this));
    }

    function withdraw(uint256 _tokenId) external updateReward(msg.sender) nonReentrant {
        require(_tokenId > 0, "LandStaking: INVALID_TOKEN_ID");
        require(isStaked[_tokenId], "LandStaking: NO_STAKES");

        isStaked[_tokenId] = false;

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
}
