" Vim config
" Samer Atiani - 2018
" Preamble {{{
" vim:foldmethod=marker:number
if &compatible
  set nocompatible               " Be iMproved
endif

" Required:
set runtimepath+=~/.cache/dein/repos/github.com/Shougo/dein.vim
set runtimepath+=.
" }}}
" dein init {{{
" Required:
if dein#load_state('~/.cache/dein')
  call dein#begin('~/.cache/dein')

  " Let dein manage dein
  " Required:
  call dein#add('~/.cache/dein/repos/github.com/Shougo/dein.vim')
  " }}}
" 3rd party plugins
  " Snippets {{{
  call dein#add('SirVer/ultisnips')
  call dein#add('honza/vim-snippets')
  " }}}
  " Syntax {{{
  " javascript
  call dein#add('pangloss/vim-javascript')
  call dein#add('leafgarland/typescript-vim')
  call dein#add('mklabs/vim-backbone')
  call dein#add('aaronj1335/underscore-templates.vim')
  call dein#add('mxw/vim-jsx')
  " css
  call dein#add('ap/vim-css-color')
  " jinja
  call dein#add('lepture/vim-jinja')
  " python
  call dein#add('Yggdroot/indentLine')
  " }}}
  " Navigation {{{
  if executable('fzf')
    call dein#local('~/', {}, ['.fzf'])
    call dein#add('junegunn/fzf.vim', { 'depends': '.fzf' })
  endif
  call dein#add('easymotion/vim-easymotion')
  call dein#add('satiani/bufferlist.vim')
  call dein#add('scrooloose/nerdtree')
  call dein#add('majutsushi/tagbar')
  call dein#add('sjl/gundo.vim')
  " }}}
  " Text manipulation {{{
  call dein#add('junegunn/vim-easy-align')
  call dein#add('mattn/emmet-vim')
  if has('nvim')
    call dein#add('bfredl/nvim-miniyank')
  endif
  call dein#add('tpope/vim-speeddating')
  call dein#add('terryma/vim-multiple-cursors')
  " }}}
  " Code completion {{{
  call dein#add('ternjs/tern_for_vim')
  call dein#add('mhartington/nvim-typescript')
  call dein#add('roxma/nvim-yarp')
  if !has('nvim')
    call dein#add('roxma/vim-hug-neovim-rpc')
  endif
  call dein#add('autozimu/LanguageClient-neovim', {'build': 'bash install.sh'})
  call dein#add('ncm2/ncm2')
  call dein#add('ncm2/ncm2-path')
  call dein#add('ncm2/ncm2-tern')
  call dein#add('ncm2/ncm2-ultisnips')
  call dein#add('ncm2/ncm2-vim', { 'depends': 'Shougo/neco-vim' })
  call dein#add('Shougo/neco-vim')
  call dein#add('ncm2/ncm2-html-subscope')
  " }}}
  " Version control {{{
  call dein#add('tpope/vim-fugitive')
  " }}}
"  " Styling {{{
  call dein#add('itchyny/lightline.vim')
  call dein#add('maximbaz/lightline-ale')
  call dein#add('flazz/vim-colorschemes')
  call dein#add('xolox/vim-misc')
  call dein#add('xolox/vim-colorscheme-switcher', { 'depends': 'xolox/vim-misc' })
  call dein#add('luochen1990/rainbow')
  call dein#add('fenetikm/falcon', {
  \ 'build': 'patch -p0 < ~/code/init/falcon.patch'
  \})
  " }}}
  " External integrations {{{
  call dein#add('w0rp/ale')
  call dein#add('benmills/vimux')
  call dein#add('pitluga/vimux-nose-test')
  if !has('nvim')
    call dein#add('Shougo/vimshell.vim')
  endif
  " }}}
  " Enhanced Vim behavior {{{
  if has('nvim')
    call dein#add('lambdalisue/suda.vim')
  else
    call dein#add('tpope/vim-eunuch')
  endif
  call dein#add('tpope/vim-unimpaired')
  call dein#add('tpope/vim-sleuth')
  call dein#add('tpope/vim-repeat')
  call dein#add('henrik/vim-indexed-search')
  call dein#add('tmhedberg/matchit')
  " }}}
  " Modes {{{
  call dein#add('jceb/vim-orgmode')
  " }}}
  " Vim tools {{{
  if has('nvim')
  endif
  call dein#add('haya14busa/dein-command.vim')
  " }}}
  " dein save state {{{
  " Required:
  call dein#end()
  call dein#save_state()
endif
" }}}
" dein install on startup? {{{
" if dein#check_install()
"   call dein#install()
" endif
" }}}
" User settings
" Vim options {{{
" General options {{{
set termguicolors
colorscheme falcon
filetype plugin on
filetype indent off
syntax enable
set directory=$HOME/vimswap/
set undofile
set undodir=$HOME/vimswap/
set backspace=indent,eol,start
set completeopt=noinsert,menuone,noselect
set tw=100
set diffopt=vertical,filler
set expandtab
if executable("rg")
  set grepprg=rg\ --vimgrep\ --no-heading
  set grepformat=%f:%l:%c:%m,%f:%l:%m
endif
set autoindent
set hidden
set history=1000
set ignorecase
set incsearch
set modeline
set showmatch		" Show matching brackets.
set smartcase
set suffixes=.bak,~,.swp,.o,.info,.aux,.log,.dvi,.bbl,.blg,.brf,.cb,.ind,.idx,.ilg,.inx,.out,.toc
set sts=4
set sw=4
set t_Co=256
set tags=tags;/
set wildmenu
set wildignore+=*/*.class,*/*.o,*/*.lo,*/*.pyc,*/*.pyo,uploads/*
set noshowmode
" }}}
" Neovim Specific options {{{
if has('nvim')
  tnoremap <C-w> <C-\><C-N><C-w>
  augroup terminal
    au!
    " Temporarily prevent recording inside terminals until I develop the muscle memory
    " no to click q after selecting text (which is how I exit copy mode in tmux)
    au TermOpen * map <buffer> q <Nop>
    au BufEnter,FocusGained,BufEnter,BufWinEnter,WinEnter term://* map <buffer> q <Nop>
    au TermOpen * startinsert
    au TermClose term://* close
  augroup END
endif
" }}}
" Key mappings {{{
let mapleader=","
let maplocalleader="\\"
map <F1> <nop>
map <Leader>q :botright cwindow<CR>
map <Leader>Q :botright lwindow<CR>
map <Leader>n :cnewer<CR>
map <Leader>p :colder<CR>
map <Leader>f :exec("Rg " . expand("<cword>"))<CR>
map <Leader>o :belowright 10split +term<CR><C-\><C-n>:set wfh<CR>:set wfw<CR>i
" Replace word under cursor
map <Leader>s :%s/\<<C-r><C-w>\>/
map tk :tabfirst<CR>
map tl :tabnext<CR>
map th :tabprev<CR>
map tj :tablast<CR>
map tn :tabnew<CR>
map î <A-n>
" Click F10 to get the highlight group under cursor
" (http://vim.wikia.com/wiki/Identify_the_syntax_highlighting_group_used_at_the_cursor)
map <F10> :echo "hi<" . synIDattr(synID(line("."),col("."),1),"name") . '> trans<'
\ . synIDattr(synID(line("."),col("."),0),"name") . "> lo<"
\ . synIDattr(synIDtrans(synID(line("."),col("."),1)),"name") . ">"<CR>
" }}}
" autcmds {{{
augroup general_autocmds
  au!
  au FileType   javascript,python,sh,c,cpp,java,html,css,php,vim
\               au BufWrite * %s/\s\+$//e
augroup END
" }}}
" }}}
" dein {{{
map <F9> :source ~/.vimrc<CR>:call dein#install()<CR>
" }}}
" Bufferlist {{{
map <silent> <F2> :call BufferList()<CR>
hi BufferSelected term=reverse ctermfg=black ctermbg=white cterm=NONE
hi BufferNormal term=NONE ctermfg=188 ctermbg=237 cterm=NONE
let g:BufferListMaxWidth = 60
" }}}
" Rainbow Parentheses {{{
let g:rainbow_active = 1
" }}}
" FZF {{{
command! FZFMru call fzf#run({
\ 'source':  reverse(s:all_files()),
\ 'sink':    'edit',
\ 'options': '-m -x +s',
\ 'down':    '40%' })

function! s:all_files()
  return extend(
  \ reverse(filter(copy(v:oldfiles),
  \        "v:val !~ 'fugitive:\\|NERD_tree\\|^/tmp/\\|.git/\\|term:\\|_Gundo_'")),
  \ map(filter(range(1, bufnr('$')), 'buflisted(v:val)'), 'bufname(v:val)'))
endfunction
nnoremap <C-p> :Files<CR>
nnoremap <C-l> :BTags<CR>
nnoremap <C-b> :FZFMru<CR>
nnoremap <C-e> :History:<CR>
nnoremap <C-h> :Helptags<CR>
let $FZF_DEFAULT_OPTS = '--bind ctrl-d:page-down,ctrl-u:page-up'
let $FZF_DEFAULT_COMMAND = 'rg --hidden --files --follow --glob "!.git/*" 2>/dev/null'
let g:fzf_history_dir = '~/.local/share/fzf-history'
" }}}
" Lightline {{{
function! LightlineMode()
  return expand('%:t') ==# '__Tagbar__' ? 'Tagbar':
        \ &filetype ==# 'fzf' ? 'FZF' :
        \ lightline#mode()
endfunction
function! LightlineFilename()
  return &filetype ==# 'fzf' ? '' :
        \ expand('%:t') !=# '' ? expand('%:t') : '[No Name]'
endfunction
let g:lightline = {
      \ 'colorscheme': 'nord',
      \ 'active': {
      \     'right': [ [ 'linter_checking', 'linter_errors', 'linter_warnings', 'linter_ok' ],
      \                [ 'lineinfo' ],
      \                [ 'percent' ],
      \                [ 'tagbar', 'filetype', 'charvaluehex'] ]
      \ },
      \ 'component': {
      \     'charvaluehex': '0x%B',
      \     'tagbar': '%{tagbar#currenttag("%s", "", "f")}'
      \ },
      \ 'component_expand': {
      \     'linter_checking': 'lightline#ale#checking',
      \     'linter_warnings': 'lightline#ale#warnings',
      \     'linter_errors': 'lightline#ale#errors',
      \     'linter_ok': 'lightline#ale#ok',
      \ },
      \ 'component_type': {
      \     'linter_checking': 'left',
      \     'linter_warnings': 'warning',
      \     'linter_errors': 'error',
      \     'linter_ok': 'left',
      \ },
      \ 'component_function': {
      \     'mode': 'LightlineMode',
      \     'filename': 'LightlineFilename',
      \ },
      \ }
" }}}
" ale {{{
let g:ale_fixers={
\    'python': ['isort', 'autopep8'],
\    'javascript': ['standard']
\}
let g:ale_linters={
\    'javascript': ['standard'],
\}
nmap <Leader>F <Plug>(ale_fix)
nmap <Leader>D <Plug>(ale_toggle_buffer)<CR>
highlight ALEError ctermbg=140
let g:ale_sign_error = '●' " Less aggressive than the default '>>'
let g:ale_sign_warning = '.'
let g:ale_lint_on_enter = 0 " Less distracting when opening a new file
" }}}
" Fugitive {{{
map <Leader>G :Gstatus<CR>
" }}}
" NERDTree {{{
function! SwitchToNerdTree(path)
    if exists("t:NERDTreeBufName")
        let winnr = bufwinnr(t:NERDTreeBufName)
        let currwinnr = bufwinnr("%")
        if winnr != -1 && winnr != currwinnr
            exec(winnr . "wincmd w")
            return
        elseif winnr != -1
            NERDTreeToggle
            return
        endif
    endif

    if a:path == ""
        NERDTreeToggle
    else
        exec("NERDTree " . a:path)
    endif
endfunction
let NERDTreeHijackNetrw = 0
let NERDTreeWinSize = 40
let NERDTreeIgnore = ['\.pyc$', '__pycache__']
let NERDTreeQuitOnOpen = 1
map <silent><F3> :call SwitchToNerdTree("")<CR>
map <silent><F4> :call SwitchToNerdTree("%")<CR>
" }}}
" UtilSnips {{{
let g:UltiSnipsExpandTrigger="<s-tab>"
let g:UltiSnipsJumpForwardTrigger="<c-j>"
let g:UltiSnipsJumpBackwardTrigger="<c-k>"
let g:UltiSnipsEditSplit="vertical"
" }}}
" vim-easy-align {{{
xmap ga <Plug>(EasyAlign)
let g:easy_align_ignore_groups = []
" }}}
" Tagbar {{{
map <silent><F5>  :TagbarToggle<CR>
let g:tagbar_left = 1
let g:tagbar_autoclose = 1
let g:tagbar_ctags_bin = '/usr/bin/ctags'
" }}}
" vim-sleuth {{{
" Disables behavior by vim-sleuth where it will turn on filetype indent
let g:did_indent_on = 0
" }}}
" vimux/neovim terminal {{{
if has('nvim')
  map <Leader>vn :10split term://~/code/web/npm_dev.sh \| startinsert<CR>
  map <Leader>vi :20split term://zsh \| sleep 100m \| startinsert<CR>cd ~/code/web && source venv/bin/activate && python manage.py shell<CR><C-\><C-n>
  map <Leader>vl :10split term://zsh \| sleep 100m \| startinsert<CR>tail -f /var/liwwa/log/**/*.log~**/*apache_access.log<CR><C-\><C-n>
else
  function! VimuxIPython()
      call VimuxSendText(@v)
  endfunction
  augroup vimux_python
    au!
    au BufEnter *.py vmap <buffer> <Leader>vr "vy :call VimuxIPython()<CR>
  augroup END
  map <Leader>vn :VimuxRunCommand("cd ~/code/web; ./npm_dev.sh")<CR>
  map <Leader>vi :VimuxRunCommand("cd ~/code/web; source venv/bin/activate; python manage.py shell")<CR>
  map <Leader>vl :VimuxRunCommand("tail -f /var/liwwa/log/**/*.log~**/*apache_access.log")<CR>
  map <Leader>vp :VimuxPromptCommand<CR>
  map <Leader>vc :VimuxCloseRunner<CR>
endif
" }}}
" tern for vim {{{
let g:tern#command = [expand("~/.langservers/javascript/run.sh")]
let g:tern#arguments = ["--persistent"]
au FileType javascript map <buffer> <Leader>D :TernDef<CR>
au FileType javascript map <buffer> <Leader>d :TernDefPreview<CR>
au FileType javascript map <buffer> <Leader>r :TernRename<CR>
" }}}
" ncm2 {{{
autocmd BufEnter  *  call ncm2#enable_for_buffer()
inoremap <silent><expr> <TAB> pumvisible() ? "\<C-n>" : "\<TAB>"
inoremap <silent><expr> <c-d> pumvisible() ? "\<PageDown>" : "\<c-d>"
inoremap <silent><expr> <c-u> pumvisible() ? "\<PageUp>" : "\<c-u>"
inoremap <expr> <CR> (pumvisible() ? "\<c-y>" : "\<CR>")
" add tern to runtimepath so it gets caught by ncm2_tern
let &runtimepath.=','.escape(expand('~/.langservers/javascript/'), '\,')
" }}}
" LanguageServer {{{
let g:LanguageClient_serverCommands = {
    \ 'python': ['~/.langservers/python/run.sh', '~/code/web/venv/'],
    \ 'typescript': ['~/.langservers/typescript/tsserver/lib/language-server-stdio.js'],
    \ }
let g:LanguageClient_diagnosticsEnable = 0
augroup language_client
  au!
  au FileType python,typescript map <buffer> <Leader>d :call LanguageClient#textDocument_definition({'gotoCmd': 'split'})<CR>
  au FileType python,typescript map <buffer> <Leader>D :call LanguageClient_textDocument_definition()<CR>
  au FileType python,typescript map <buffer> <Leader>r :call LanguageClient#textDocument_rename()<CR>
  au FileType python,typescript map <buffer> <Leader>t :call LanguageClient_textDocument_documentSymbol()<CR>
  au FileType python,typescript map <buffer> K :call LanguageClient_textDocument_hover()<CR>
  au User LanguageClientStarted command References call LanguageClient#textDocument_references()
  au User LanguageClientStopped delcommand References
augroup END
" }}}
" miniyank {{{
map p <Plug>(miniyank-autoput)
map P <Plug>(miniyank-autoPut)
map <localleader>[ <Plug>(miniyank-cycle)
" }}}
" gundo {{{
map <Leader>u :GundoShow<CR>
" }}}
" indentLine {{{
let g:indentLine_fileType = ['python']
" }}}
" liwwa {{{
augroup liwwa
  au!
  au BufWritePost *.py :silent !~/code/web/bin/compile_all.sh
  au BufEnter ~/code/web/app/static/**/*.html :set syntax=underscore_template
  au BufEnter *.html :silent RainbowToggleOff
augroup END
let g:python_host_prog  = '/usr/local/bin/python'
" }}}
