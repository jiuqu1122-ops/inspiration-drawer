import { AnimatePresence,motion } from 'framer-motion';
import { Check,Edit3,FolderOpen,FolderPlus,Image as ImageIcon,KeyRound,Move,Send,Trash2,X } from 'lucide-react';
import React from 'react';
import type { Folder } from '../../types';
import type { VirtualDropUiJob } from '../../types/virtualDrop';

export type AppPrimaryOverlaysScope = Record<string, any> & {
  folders: Folder[];
  virtualDropJobs: VirtualDropUiJob[];
};

export function AppPrimaryOverlays({ scope }: { scope: AppPrimaryOverlaysScope }) {
  const { addInspirationSpaceShareAndReturnToCanvas, cancelVirtualDropJob, canRegisterByEmail, confirmSnip, deleteDrawerFolders, emailChallengeId, emailRegistrationError, emailVerificationCode, folderContextMenu, folders, formatVirtualDropBytes, getFolderActionIds, handleOpenFolderModal, inspirationSpaceTemplateOptions, isEmailCodeSending, isEmailVerifying, isInspirationSpaceOpen, isLicenseGateActive, isLicenseLoading, isMouseDown, keepDrawerOpenByPointer, LazyInspirationSpaceWindow, licenseGateMessage, licenseGateTitle, loadInspirationSpaceDrawerImages, openMoveExistingFolderModal, prepareInspirationSpaceTemplate, readInspirationSpaceDrawerImage, registrationDisplayName, registrationEmail, requestEmailCode, selection, setActiveFolderId, setEditingFolderId, setEmailChallengeId, setEmailRegistrationError, setEmailVerificationCode, setFolderContextMenu, setIsInspirationSpaceOpen, setRegistrationDisplayName, setRegistrationEmail, setRenameValue, setSelection, snipMode, startPos, verifyEmailAccount, virtualDropJobs } = scope;
  return (
<>
<AnimatePresence>
        {isInspirationSpaceOpen && (
          <motion.div
            data-inspiration-space-overlay="true"
            className="pointer-events-none absolute inset-0 z-[100200] flex items-center justify-center py-8 pl-8 pr-28"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            <motion.section
              data-inspiration-space-panel="true"
              className="pointer-events-auto h-full max-h-[840px] w-full max-w-[1080px] overflow-hidden rounded-[16px] border border-stone-200/90 bg-[#f5f4ef] shadow-[0_28px_90px_rgba(41,37,36,0.22)]"
              initial={{ y: 12, scale: 0.975 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 8, scale: 0.985 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <React.Suspense fallback={(
                <div className="grid h-full place-items-center bg-[#f5f4ef] text-xs font-semibold text-stone-500">
                  正在打开灵感空间…
                </div>
              )}>
                <LazyInspirationSpaceWindow
                  embedded
                  onClose={() => setIsInspirationSpaceOpen(false)}
                  onAddToCanvas={addInspirationSpaceShareAndReturnToCanvas}
                  templateOptions={inspirationSpaceTemplateOptions}
                  onPrepareTemplate={prepareInspirationSpaceTemplate}
                  onLoadDrawerImages={loadInspirationSpaceDrawerImages}
                  onReadDrawerImage={readInspirationSpaceDrawerImage}
                />
              </React.Suspense>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {folderContextMenu && (() => {
          const actionIds = getFolderActionIds(folderContextMenu.folderId);
          const targetFolder = folders.find(folder => folder.id === folderContextMenu.folderId);
          const isBatch = actionIds.length > 1;
          if (!targetFolder || actionIds.length === 0) return null;
          return (
            <motion.div
              data-folder-context-menu="true"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: 'tween', duration: 0.12, ease: 'easeOut' }}
              className="fixed z-[100070] w-44 overflow-hidden rounded-[14px] border border-stone-200 bg-white py-1 text-[11px] font-bold text-stone-700 shadow-xl dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 pointer-events-auto"
              style={{
                left: Math.min(folderContextMenu.x, Math.max(12, window.innerWidth - 188)),
                top: Math.min(folderContextMenu.y, Math.max(12, window.innerHeight - 190)),
              }}
              onClick={event => event.stopPropagation()}
              onMouseDown={event => event.stopPropagation()}
              onContextMenu={event => event.preventDefault()}
            >
              <button
                type="button"
                onClick={() => {
                  setActiveFolderId(folderContextMenu.folderId);
                  setFolderContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
                打开
              </button>
              <button
                type="button"
                onClick={() => handleOpenFolderModal(folderContextMenu.folderId)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <FolderPlus className="h-3.5 w-3.5 text-emerald-500" />
                新建子文件夹
              </button>
              <button
                type="button"
                disabled={isBatch}
                onClick={() => {
                  setEditingFolderId(folderContextMenu.folderId);
                  setRenameValue(targetFolder.name);
                  setFolderContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400 disabled:hover:bg-transparent dark:hover:bg-stone-800 dark:disabled:text-stone-600"
              >
                <Edit3 className="h-3.5 w-3.5 text-blue-500" />
                重命名
              </button>
              <button
                type="button"
                onClick={() => openMoveExistingFolderModal(actionIds)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <Move className="h-3.5 w-3.5 text-emerald-500" />
                {isBatch ? `移动 ${actionIds.length} 个文件夹到…` : '移动到…'}
              </button>
              <button
                type="button"
                onClick={() => deleteDrawerFolders(actionIds)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isBatch ? `删除 ${actionIds.length} 个文件夹` : '删除'}
              </button>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {virtualDropJobs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed right-3 top-12 z-[999998] flex w-[min(340px,calc(100vw-24px))] flex-col gap-2 pointer-events-auto"
          >
            {virtualDropJobs.map(job => {
              const progress = typeof job.progress === 'number' ? Math.round(job.progress * 100) : undefined;
              const isTerminal = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled' || job.status === 'timed_out';
              const statusText = job.status === 'completed'
                ? '完成'
                : job.status === 'failed'
                  ? '失败'
                  : job.status === 'cancelled'
                    ? '已取消'
                    : job.status === 'timed_out'
                      ? '已超时'
                      : '正在导入网页图片...';
              return (
                <motion.div
                  key={job.id}
                  layout
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  className="rounded-[14px] border border-stone-200/80 bg-white/94 p-3 text-stone-800 shadow-2xl shadow-black/12 backdrop-blur-xl dark:border-white/10 dark:bg-stone-950/94 dark:text-stone-100"
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-blue-600 dark:bg-blue-400/12 dark:text-blue-200">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-[12px] font-black">{job.fileName}</p>
                        <span className="shrink-0 text-[10px] font-bold text-stone-400 dark:text-stone-500">{statusText}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                        <span>{formatVirtualDropBytes(job.loaded)}</span>
                        {job.total ? <span>/ {formatVirtualDropBytes(job.total)}</span> : null}
                        {progress !== undefined ? <span>{progress}%</span> : null}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                        <div
                          className={`h-full rounded-full transition-all ${job.status === 'failed' || job.status === 'timed_out' ? 'bg-red-500' : job.status === 'cancelled' ? 'bg-stone-400' : 'bg-blue-500'}`}
                          style={{ width: `${progress ?? (isTerminal ? 100 : 22)}%` }}
                        />
                      </div>
                      {job.message ? <p className="mt-1 max-h-8 overflow-hidden text-[10px] leading-4 text-stone-400 dark:text-stone-500">{job.message}</p> : null}
                    </div>
                    {!isTerminal && (
                      <button
                        type="button"
                        onClick={() => cancelVirtualDropJob(job.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-500 dark:hover:bg-white/10"
                        title="取消导入"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {snipMode.active && (
          <motion.div
            initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] cursor-crosshair pointer-events-auto will-change-transform"
            onMouseDown={(e) => { isMouseDown.current = true; startPos.current = { x: e.clientX, y: e.clientY }; setSelection({ x: e.clientX, y: e.clientY, w: 0, h: 0 }); }}
            onMouseMove={(e) => { if (!isMouseDown.current) return; const x = Math.min(e.clientX, startPos.current.x); const y = Math.min(e.clientY, startPos.current.y); const w = Math.abs(e.clientX - startPos.current.x); const h = Math.abs(e.clientY - startPos.current.y); setSelection({ x, y, w, h }); }}
            onMouseUp={(e) => {
              isMouseDown.current = false;
              confirmSnip({
                screenX: e.screenX,
                screenY: e.screenY,
                clientX: e.clientX,
                clientY: e.clientY,
              });
            }}
          >
            {snipMode.bg && <img src={snipMode.bg} className="w-full h-full object-cover pointer-events-none" />}

            {selection ? (
              <>
                <div className="absolute inset-0 pointer-events-none">
                  <div
                    className="absolute left-0 right-0 top-0 bg-black/38"
                    style={{ height: selection.y }}
                  />
                  <div
                    className="absolute left-0 bg-black/38"
                    style={{ top: selection.y, width: selection.x, height: selection.h }}
                  />
                  <div
                    className="absolute right-0 bg-black/38"
                    style={{ top: selection.y, left: selection.x + selection.w, height: selection.h }}
                  />
                  <div
                    className="absolute left-0 right-0 bottom-0 bg-black/38"
                    style={{ top: selection.y + selection.h }}
                  />
                </div>

                <div
                  className="absolute pointer-events-none rounded-[4px] border-2 border-emerald-400 shadow-[0_0_0_1px_rgba(255,255,255,0.7),0_0_0_9999px_rgba(0,0,0,0.02)]"
                  style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h }}
                >
                  <div className="absolute inset-0 bg-white/10" />
                  <div className="absolute inset-0 ring-1 ring-emerald-300/80" />
                  <div className="absolute -top-7 right-0 rounded-md bg-emerald-500/95 px-2 py-1 text-[10px] font-semibold text-white shadow-lg whitespace-nowrap">
                    {Math.max(0, Math.round(selection.w))} × {Math.max(0, Math.round(selection.h))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="absolute inset-0 bg-black/38 pointer-events-none" />
                <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-[12px] font-medium text-white shadow-lg pointer-events-none backdrop-blur-sm">
                  拖动鼠标框选截图区域，按 Esc 取消
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isLicenseGateActive && (
          <motion.div
            data-license-gate="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
            className="absolute inset-0 z-[100000] flex items-center justify-center rounded-[30px] bg-stone-100/78 p-5 text-stone-900 shadow-inner backdrop-blur-md dark:bg-stone-950/74 dark:text-stone-50 pointer-events-auto"
            onPointerEnter={keepDrawerOpenByPointer}
            onPointerMove={keepDrawerOpenByPointer}
            onPointerDown={(event) => { keepDrawerOpenByPointer(); event.stopPropagation(); }}
            onMouseDown={(event) => { keepDrawerOpenByPointer(); event.stopPropagation(); }}
            onClick={(event) => { keepDrawerOpenByPointer(); event.stopPropagation(); }}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
              className="max-h-[calc(100%_-_24px)] w-full max-w-[430px] overflow-y-auto rounded-[24px] border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-stone-900 text-white dark:bg-white dark:text-stone-950">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-black">{licenseGateTitle}</h2>
                  <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{licenseGateMessage}</p>
                </div>
              </div>

              {canRegisterByEmail ? (
                <div className="mt-4 rounded-[14px] border border-blue-200 bg-blue-50 px-3 py-2 text-center text-[11px] font-black text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100">
                  邮箱是账户身份 · 换设备不会重新计算授权时间
                </div>
              ) : (
                <div className="mt-4 rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-black text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                  请联系开发者处理授权 <span className="font-mono">VX:jiuquz</span>
                </div>
              )}

              {canRegisterByEmail && (
                <div className="mt-4 rounded-[16px] border border-blue-100 bg-blue-50/70 p-3 dark:border-blue-400/20 dark:bg-blue-400/10">
                  <label className="grid gap-2">
                    <span className="text-[11px] font-black text-stone-600 dark:text-stone-300">邮箱</span>
                    <input
                      value={registrationEmail}
                      onChange={(event) => {
                        setRegistrationEmail(event.target.value);
                        if (emailChallengeId) {
                          setEmailChallengeId('');
                          setEmailVerificationCode('');
                        }
                        if (emailRegistrationError) setEmailRegistrationError('');
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !isEmailCodeSending && !emailChallengeId) void requestEmailCode();
                      }}
                      maxLength={254}
                      autoComplete="email"
                      inputMode="email"
                      placeholder="name@example.com"
                      className="h-11 w-full rounded-[14px] border border-blue-100 bg-white px-3 text-sm font-bold text-stone-800 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 dark:border-blue-400/20 dark:bg-stone-950 dark:text-stone-100"
                    />
                  </label>

                  <label className="mt-3 grid gap-2">
                    <span className="text-[11px] font-black text-stone-600 dark:text-stone-300">用户名</span>
                    <input
                      value={registrationDisplayName}
                      onChange={(event) => {
                        setRegistrationDisplayName(event.target.value);
                        if (emailRegistrationError) setEmailRegistrationError('');
                      }}
                      maxLength={32}
                      autoComplete="nickname"
                      placeholder="首次注册必填，已有账户可留空"
                      className="h-11 w-full rounded-[14px] border border-blue-100 bg-white px-3 text-sm font-bold text-stone-800 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 dark:border-blue-400/20 dark:bg-stone-950 dark:text-stone-100"
                    />
                    <small className="text-[10px] leading-4 text-stone-500 dark:text-stone-400">仅用于后台识别，无需填写真实姓名</small>
                  </label>

                  <label className="mt-3 grid gap-2">
                    <span className="text-[11px] font-black text-stone-600 dark:text-stone-300">6 位验证码</span>
                    <input
                      value={emailVerificationCode}
                      onChange={(event) => {
                        setEmailVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                        if (emailRegistrationError) setEmailRegistrationError('');
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && emailChallengeId && !isEmailVerifying) void verifyEmailAccount();
                      }}
                      disabled={!emailChallengeId || isEmailVerifying}
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder={emailChallengeId ? '000000' : '发送验证码后在这里填写'}
                      className="h-11 w-full rounded-[14px] border border-blue-100 bg-white px-3 text-sm font-bold text-stone-800 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400 dark:border-blue-400/20 dark:bg-stone-950 dark:text-stone-100 dark:disabled:bg-stone-900 dark:disabled:text-stone-600"
                    />
                  </label>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void requestEmailCode()}
                      disabled={isEmailCodeSending || isEmailVerifying || isLicenseLoading}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-blue-200 bg-white px-3 text-[11px] font-black text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-wait disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400 dark:border-blue-400/20 dark:bg-stone-950 dark:text-blue-200 dark:disabled:border-stone-700 dark:disabled:bg-stone-900"
                    >
                      <Send className="h-4 w-4" />
                      {isEmailCodeSending ? '正在发送…' : emailChallengeId ? '重新发送' : '发送验证码'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void verifyEmailAccount()}
                      disabled={!emailChallengeId || isEmailVerifying || isLicenseLoading}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-blue-600 px-3 text-[11px] font-black text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-stone-300 dark:disabled:bg-stone-700"
                    >
                      <Check className="h-4 w-4" />
                      {isEmailVerifying ? '正在验证…' : '验证并进入'}
                    </button>
                  </div>

                  {emailChallengeId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEmailChallengeId('');
                        setEmailVerificationCode('');
                        setEmailRegistrationError('');
                      }}
                      disabled={isEmailVerifying}
                      className="mt-2 h-8 w-full rounded-[12px] text-[10px] font-black text-stone-500 hover:bg-white/80 disabled:opacity-50 dark:text-stone-400 dark:hover:bg-stone-950/50"
                    >
                      更换邮箱
                    </button>
                  )}

                  {emailRegistrationError && (
                    <div className="mt-2 rounded-[12px] bg-red-50 px-3 py-2 text-[10px] font-bold leading-4 text-red-600 dark:bg-red-400/10 dark:text-red-200">
                      {emailRegistrationError}
                    </div>
                  )}
                </div>
              )}

              {canRegisterByEmail && (
                <div className="mt-4 rounded-[14px] border border-stone-200 bg-stone-50 px-3 py-2 text-center text-[10px] leading-4 text-stone-500 dark:border-stone-800 dark:bg-stone-950/60 dark:text-stone-400">
                  本机会自动读取已有离线授权并继承原到期时间，无需粘贴 License 或填写机器码。
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
</>
  );
}
