//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPIXD {
    function mint(address to, uint256 tokenId) external;

    event PIXDMinted(address indexed account, uint256 indexed tokenId);

    event ModeratorUpdated(address indexed moderator, bool approved);
}
