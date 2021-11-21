//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";

contract PIXT is ERC20PresetMinterPauser("PlanetIX", "IXT"), EIP712("PlanetIX", "1") {
    bytes32 private constant PERMIT_FOR_BID_HASH =
        keccak256(
            "PermitForBid(address owner,address spender,uint256 amount,address nftToken,uint256 tokenId,uint256 nonce)"
        );

    mapping(address => uint256) public nonces;

    constructor() {
        // initial supply : 140,000,000
        _mint(msg.sender, 140 * 1e24);
    }

    function permitForBid(
        address owner,
        address spender,
        uint256 amount,
        address nftToken,
        uint256 tokenId,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        uint256 nonce = nonces[owner]++;
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_FOR_BID_HASH, owner, spender, amount, nftToken, tokenId, nonce)
        );
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, v, r, s);
        require(signer == owner, "PIXT: INVALID_SIGNATURE");

        _approve(owner, spender, amount);
    }
}
