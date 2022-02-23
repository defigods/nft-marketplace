//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "../interfaces/IPIX.sol";

contract PIXStakingLottery is OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;

    event StakedPixNFT(uint256 tokenId, address indexed recipient);
    event WithdrawnPixNFT(uint256 tokenId, address indexed recipient);
    event RewardPaid(uint256 pending, address indexed recipient);

    struct UserInfo {
        mapping(uint256 => bool) isStaked;
        uint256 tiers;
    }

    mapping(address => UserInfo) public userInfo;
    mapping(uint256 => uint256) public tierInfo;
    mapping(address => uint256) public earned;

    IERC20Upgradeable public rewardToken;

    address public pixNFT;
    uint256 public lastUpdateBlock;
    uint256 public rewardPerBlock;
    uint256 public totalTiers;

    function initialize(
        address _pixt,
        address _pixNFT,
        uint256 _rewardPerBlock
    ) external initializer {
        require(_pixt != address(0), "Staking: INVALID_PIXT");
        require(_pixNFT != address(0), "Staking: INVALID_PIX");

        rewardToken = IERC20Upgradeable(_pixt);
        pixNFT = _pixNFT;
        rewardPerBlock = _rewardPerBlock;
        __Ownable_init();
    }

    function stake(uint256 _tokenId) external {
        require(_tokenId > 0, "Staking: INVALID_TOKEN_ID");
        require(tierInfo[_tokenId] > 0, "Staking: INVALID_TIER");
        require(IPIX(pixNFT).isTerritory(_tokenId), "Staking: TERRITORY_ONLY");

        UserInfo storage user = userInfo[msg.sender];

        uint256 tiers = tierInfo[_tokenId];

        IERC721Upgradeable(pixNFT).transferFrom(msg.sender, address(this), _tokenId);
        totalTiers = totalTiers.add(tiers);

        // Update User Info
        user.tiers = user.tiers.add(tiers);
        user.isStaked[_tokenId] = true;

        if (lastUpdateBlock == 0) {
            lastUpdateBlock = block.number;
        }

        emit StakedPixNFT(_tokenId, address(this));
    }

    function withdraw(uint256 _tokenId) external {
        require(_tokenId > 0, "Staking: INVALID_TOKEN_ID");
        UserInfo storage user = userInfo[msg.sender];
        require(user.tiers > 0, "Staking: NO_WITHDRAWALS");
        require(user.isStaked[_tokenId], "Staking: NO_STAKES");

        IERC721Upgradeable(pixNFT).transferFrom(address(this), msg.sender, _tokenId);
        totalTiers = totalTiers.sub(tierInfo[_tokenId]);
        // Update UserInfo
        user.tiers = user.tiers.sub(tierInfo[_tokenId]);
        user.isStaked[_tokenId] = false;

        emit WithdrawnPixNFT(_tokenId, msg.sender);
    }

    function claim() external {
        require(earned[msg.sender] > 0, "Claiming: NO_Tokens to withdraw");

        rewardToken.transfer(msg.sender, earned[msg.sender]);
        earned[msg.sender] = 0;
        emit RewardPaid(earned[msg.sender], msg.sender);
    }

    function setReward(address _winner) external onlyOwner {
        uint256 pending = _calculateReward();
        require(pending > 0, "setReward: no tokens to set");
        if (pending > 0) {
            earned[_winner] += pending;
        }
    }

    function setRewardPerBlock(uint256 _amount) external onlyOwner {
        rewardPerBlock = _amount;
    }

    function setTierInfo(uint256 _tokenId, uint256 _tiers) external onlyOwner {
        require(_tiers > 0, "Staking: INVALID_TIERS");

        tierInfo[_tokenId] = _tiers;
    }

    function _calculateReward() internal view returns (uint256) {
        uint256 blocksPassed = block.number.sub(lastUpdateBlock);
        return rewardPerBlock.mul(blocksPassed);
    }
}
