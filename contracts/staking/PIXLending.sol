//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "../interfaces/IPIX.sol";

contract PIXLending is OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;
    address public pixNFT;
    IERC20Upgradeable public pixt;
    uint256 public feePerSecond;
    enum Status {
        None,
        Listed,
        Lended
    }

    struct NFTInfo {
        Status status;
        uint256 amount;
        address lender;
        uint256 duration;
        uint256 lendTime;
        address borrower;
    }
    mapping(uint256 => NFTInfo) public info;

    function initialize(
        address _pixt,
        address _pixNFT,
        uint256 _feePerSecond
    ) external initializer {
        require(_pixt != address(0), "Staking: INVALID_PIXT");
        require(_pixNFT != address(0), "Staking: INVALID_PIX");
        pixt = IERC20Upgradeable(_pixt);
        pixNFT = _pixNFT;
        feePerSecond = _feePerSecond;
        __Ownable_init();
    }

    function setFeePerSecond(uint256 _amount) external onlyOwner {
        feePerSecond = _amount;
    }

    function createRequest(
        uint256 _tokenId,
        uint256 _amount,
        uint256 _duration
    ) external {
        require(info[_tokenId].status == Status.None, "Listing: INVALID_PIX");

        info[_tokenId].status = Status.Listed;
        info[_tokenId].amount = _amount;
        info[_tokenId].borrower = msg.sender;
        info[_tokenId].duration = _duration;

        IERC721Upgradeable(pixNFT).transferFrom(msg.sender, address(this), _tokenId);
    }

    function cancelRequest(uint256 _tokenId) external {
        require(info[_tokenId].status == Status.Listed, "cancelRequest: INVALID_PIX");
        require(info[_tokenId].borrower == msg.sender, "cancelRequest: INVALID lister");

        info[_tokenId].status = Status.None;

        IERC721Upgradeable(pixNFT).transferFrom(address(this), msg.sender, _tokenId);
    }

    function acceptRequest(uint256 _tokenId) external {
        require(info[_tokenId].status == Status.Listed, "acceptRequest: INVALID_PIX");
        info[_tokenId].status = Status.Lended;

        info[_tokenId].lendTime = block.timestamp;
        info[_tokenId].lender = msg.sender;
        IERC721Upgradeable(pixNFT).transferFrom(address(this), msg.sender, _tokenId);
        pixt.transferFrom(msg.sender, info[_tokenId].lender, info[_tokenId].amount);
    }

    function payDebt(uint256 _tokenId) external {
        require(info[_tokenId].status == Status.Lended, "Paying: INVALID_PIX");
        require(info[_tokenId].borrower == msg.sender, "Paying: INVALID borrower");

        if (block.timestamp - info[_tokenId].lendTime > info[_tokenId].duration) {
            info[_tokenId].status = Status.None;
            return;
        }

        uint256 amount = info[_tokenId].amount.add(calculateFee(info[_tokenId].lendTime));

        IERC721Upgradeable(pixNFT).transferFrom(info[_tokenId].lender, msg.sender, _tokenId);
        pixt.transferFrom(msg.sender, info[_tokenId].lender, amount);
    }

    function calculateFee(uint256 _lendTime) public view returns (uint256) {
        return block.timestamp.sub(_lendTime).mul(feePerSecond);
    }
}
