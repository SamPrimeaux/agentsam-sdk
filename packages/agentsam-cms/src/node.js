/** Host repositories only; never create a database or install CMS SQL. */
export {createMerchantCms} from './application.js';
export function createCmsHostRepository(repository) {
  const required=['createPage','readPage','mutate','history','getRevision','getPublication'];
  if(!repository || required.some(name=>typeof repository[name]!=='function'))
    throw new TypeError('cms_host_repository_contract_required');
  return repository;
}
