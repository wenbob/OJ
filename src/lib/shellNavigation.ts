export function isShellNavItemActive(pathname: string, href: string) {
  if (isTopLevelPath(href)) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function isTopLevelPath(pathname: string) {
  return pathname.split("/").filter(Boolean).length === 1;
}
