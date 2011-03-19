python << EOF
import vim
import os

def open_ejs_file(orientation):
    base_dir = os.path.dirname(vim.current.buffer.name)
    current_word = vim.eval("expand('<cword>')")

    ejs_file_name = "%s.ejs" % current_word

    for root_dir, dir_names, fnames in os.walk(base_dir):
        if ejs_file_name in fnames:
            full_path = os.path.join(root_dir, ejs_file_name)
            if orientation == 'vertical':
                vim.command("vsp " + full_path)
            else:
                vim.command("sp" + full_path)

EOF

map <Leader>x :py open_ejs_file("vertical")<CR>
map <Leader>X :py open_ejs_file("horizontal")<CR>
