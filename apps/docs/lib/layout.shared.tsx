import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: '@mvd/mock-oidc' },
    githubUrl: 'https://github.com/meesvandongen/mock-oidc',
    links: [{ text: 'Live demo', url: 'https://demo.mock-oidc.mvd.im/' }],
  };
}
